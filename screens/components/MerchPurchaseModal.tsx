import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { Colors } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { friendlyError, edgeFunctionErrorMessage } from '../../lib/errors';
import { verifyAddress, VerifiedAddress } from '../../lib/geocode';
import { sendPush } from '../../lib/sendPush';
import { randomUUID } from '../../lib/uuid';
import WizardModal from './WizardModal';

// One-item "buy now" flow for marina merchandise — no cart, mirrors
// RentalBookingModal's instant-book Stripe pattern (insert the order row
// first, then create-merch-payment-intent, then PaymentSheet). Unlike a
// rental, there's no exclusive resource to hold — stock only decrements once
// the webhook sees payment_intent.succeeded — so a cancelled/abandoned
// payment just leaves the order at 'pending_payment' with nothing to expire.

const STEP_TITLES = ['Order Details', 'Review & Pay'];

export type MerchProduct = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  photos: string[];
  stock_quantity: number | null;
  fulfillment_type: 'pickup' | 'ship';
};

type Props = {
  visible: boolean;
  product: MerchProduct | null;
  marinaId: string;
  marinaProfileId: string | null;
  onClose: () => void;
  onSubmitted: () => void;
};

export default function MerchPurchaseModal({ visible, product, marinaId, marinaProfileId, onClose, onSubmitted }: Props) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [step, setStep] = useState(0);
  const [orderId] = useState(() => randomUUID());

  const [quantity, setQuantity] = useState(1);
  const [shippingAddress, setShippingAddress] = useState('');
  const [verifiedAddress, setVerifiedAddress] = useState<VerifiedAddress | null>(null);
  const [verifyingAddress, setVerifyingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!product) return null;

  const maxQuantity = product.stock_quantity ?? 99;
  const needsShipping = product.fulfillment_type === 'ship';
  const total = product.price_cents * quantity;

  const step0Valid = quantity >= 1 && quantity <= maxQuantity && (!needsShipping || verifiedAddress != null);
  const stepValid = [step0Valid, true][step];

  function reset() {
    setStep(0);
    setQuantity(1);
    setShippingAddress('');
    setVerifiedAddress(null);
    setVerifyingAddress(false);
    setAddressError(null);
  }

  function close() {
    reset();
    onClose();
  }

  function handleBack() {
    setStep(Math.max(0, step - 1));
  }

  function handleContinue() {
    if (!stepValid) return;
    if (step < STEP_TITLES.length - 1) setStep(step + 1);
    else submit();
  }

  function onAddressChange(text: string) {
    setShippingAddress(text);
    setVerifiedAddress(null);
    setAddressError(null);
  }

  async function handleVerifyAddress() {
    if (verifyingAddress || !shippingAddress.trim()) return;
    setVerifyingAddress(true);
    setAddressError(null);
    const result = await verifyAddress(shippingAddress);
    setVerifyingAddress(false);
    if (!result) {
      setAddressError("Couldn't find that address — check the street number and try again.");
      return;
    }
    setVerifiedAddress(result);
  }

  async function submit() {
    if (saving || !product) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from('merch_orders').insert({
      id: orderId,
      product_id: product.id,
      buyer_id: user.id,
      quantity,
      shipping_address: needsShipping && verifiedAddress
        ? { formatted: verifiedAddress.formatted, latitude: verifiedAddress.latitude, longitude: verifiedAddress.longitude }
        : null,
      // marina_id and unit_price_cents are stamped server-side by a trigger.
    });

    if (insertError) {
      setSaving(false);
      Alert.alert('Could not start order', friendlyError(insertError));
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('create-merch-payment-intent', {
        body: { order_id: orderId },
      });
      if (error || !data?.client_secret) throw new Error(await edgeFunctionErrorMessage(error, 'Could not start payment'));

      const { error: sheetError } = await initPaymentSheet({
        merchantDisplayName: 'Narrows',
        paymentIntentClientSecret: data.client_secret,
        applePay: { merchantCountryCode: 'CA' },
      });
      if (sheetError) throw new Error(sheetError.message);

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') Alert.alert('Payment failed', presentError.message);
        else Alert.alert('Order saved', 'You can finish paying any time — reopen this from the marina\'s Shop.');
        setSaving(false);
        onSubmitted();
        return;
      }

      if (marinaProfileId) {
        await supabase.from('notifications').insert({
          recipient_id: marinaProfileId,
          actor_id: user.id,
          type: 'booking',
          comment_body: `${product.name} × ${quantity} purchased and paid.`,
        });
        sendPush(marinaProfileId, 'Merchandise order paid', `${product.name} × ${quantity} — check Merchandise → Orders.`);
      }

      Alert.alert('Ordered!', needsShipping ? 'Paid — the marina will ship your order soon.' : 'Paid — pick it up at the marina.');
      setSaving(false);
      reset();
      onSubmitted();
    } catch (err) {
      setSaving(false);
      Alert.alert('Payment failed', `${(err as Error).message}\n\nYour order is saved — try paying again from the Shop.`);
      onSubmitted();
    }
  }

  return (
    <WizardModal
      visible={visible}
      onClose={close}
      title={product.name}
      stepTitles={STEP_TITLES}
      stepIndex={step}
      canContinue={stepValid}
      onBack={handleBack}
      onContinue={handleContinue}
      submitting={saving}
      submitLabel="Pay Now"
    >
      {step === 0 && (
        <>
          {product.photos?.[0] && <Image source={{ uri: product.photos[0] }} style={styles.productImage} />}
          {product.description && <Text style={styles.description}>{product.description}</Text>}

          <Text style={styles.label}>Quantity</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity style={styles.stepperButton} onPress={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1}>
              <Ionicons name="remove" size={18} color={Colors.cream} />
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{quantity}</Text>
            <TouchableOpacity style={styles.stepperButton} onPress={() => setQuantity((q) => Math.min(maxQuantity, q + 1))} disabled={quantity >= maxQuantity}>
              <Ionicons name="add" size={18} color={Colors.cream} />
            </TouchableOpacity>
          </View>
          {product.stock_quantity != null && (
            <Text style={styles.helperText}>{product.stock_quantity} in stock.</Text>
          )}

          {needsShipping ? (
            <>
              <Text style={styles.label}>Shipping address</Text>
              <TextInput
                style={styles.input}
                placeholder="Street address, city"
                placeholderTextColor={Colors.muted}
                value={shippingAddress}
                onChangeText={onAddressChange}
                onSubmitEditing={handleVerifyAddress}
              />
              {verifiedAddress ? (
                <Text style={styles.addressVerified}>✓ {verifiedAddress.formatted}</Text>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.verifyButton, (!shippingAddress.trim() || verifyingAddress) && styles.disabled]}
                    onPress={handleVerifyAddress}
                    disabled={!shippingAddress.trim() || verifyingAddress}
                  >
                    <Text style={styles.verifyButtonText}>{verifyingAddress ? 'Checking…' : 'Verify address'}</Text>
                  </TouchableOpacity>
                  {addressError && <Text style={styles.errorText}>{addressError}</Text>}
                </>
              )}
            </>
          ) : (
            <Text style={styles.helperText}>Pickup at the marina — no shipping needed.</Text>
          )}
        </>
      )}

      {step === 1 && (
        <>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Item</Text>
            <Text style={styles.reviewValue}>{product.name} × {quantity}</Text>
          </View>
          {needsShipping && verifiedAddress && (
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Ships to</Text>
              <Text style={styles.reviewValue}>{verifiedAddress.formatted}</Text>
            </View>
          )}
          {!needsShipping && (
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Fulfillment</Text>
              <Text style={styles.reviewValue}>Pickup at the marina</Text>
            </View>
          )}

          <View style={styles.estimateBox}>
            <Text style={styles.estimateLabel}>Total due now</Text>
            <Text style={styles.estimateValue}>${(total / 100).toFixed(2)}</Text>
          </View>
        </>
      )}
    </WizardModal>
  );
}

const styles = StyleSheet.create({
  label: { color: Colors.cream, fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  helperText: { color: Colors.muted, fontSize: 12, marginTop: 8, lineHeight: 16 },
  description: { color: Colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 4 },
  errorText: { color: '#FF6B6B', fontSize: 12, marginTop: 8, lineHeight: 16 },
  addressVerified: { color: '#4CAF50', fontSize: 13, marginTop: 8, fontWeight: '600' },

  productImage: { width: '100%', height: 160, borderRadius: 12, marginBottom: 12, backgroundColor: Colors.surface },

  input: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: Colors.cream, fontSize: 15 },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepperButton: { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: '#333333', alignItems: 'center', justifyContent: 'center' },
  stepperValue: { color: Colors.cream, fontSize: 18, fontWeight: '700', minWidth: 24, textAlign: 'center' },

  verifyButton: { backgroundColor: Colors.surface, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: '#333333' },
  verifyButtonText: { color: Colors.cream, fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.4 },

  reviewRow: { marginBottom: 14 },
  reviewLabel: { color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  reviewValue: { color: Colors.cream, fontSize: 15, marginTop: 3 },

  estimateBox: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginTop: 12, alignItems: 'center' },
  estimateLabel: { color: Colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  estimateValue: { color: Colors.gold, fontSize: 26, fontWeight: '800', marginTop: 4 },
});
