import { supabase } from '../config/supabase';

// ── RIDE JOBS ────────────────────────────────────────────────

export async function createRideJob({ clientId, clientLat, clientLng, clientNotes }) {
  const { data, error } = await supabase
    .from('ride_jobs')
    .insert({
      client_id: clientId,
      client_lat: clientLat,
      client_lng: clientLng,
      client_notes: clientNotes,
      status: 'pending',
    })
    .select()
    .single();
  return { data, error };
}

export async function acceptRideJob({ jobId, driverId, driverLat, driverLng }) {
  const { data, error } = await supabase
    .from('ride_jobs')
    .update({
      driver_id: driverId,
      driver_lat: driverLat,
      driver_lng: driverLng,
      status: 'accepted',
    })
    .eq('id', jobId)
    .eq('status', 'pending') // prevent double-accept race condition
    .select()
    .single();
  return { data, error };
}

export async function getRideJob(jobId) {
  const { data, error } = await supabase
    .from('ride_jobs')
    .select('*')
    .eq('id', jobId)
    .single();
  return { data, error };
}

export async function markRideCompleteDriver(jobId, completionLat, completionLng) {
  const fields = { driver_complete: true, status: 'complete' };
  if (completionLat != null && completionLng != null) {
    fields.completion_lat = completionLat;
    fields.completion_lng = completionLng;
  }
  const { error } = await supabase
    .from('ride_jobs')
    .update(fields)
    .eq('id', jobId);
  return { error };
}

export async function markRideCompleteClient(jobId) {
  const { error } = await supabase
    .from('ride_jobs')
    .update({ client_complete: true })
    .eq('id', jobId);
  return { error };
}

export async function cancelRideJob(jobId) {
  const { error } = await supabase
    .from('ride_jobs')
    .update({ status: 'canceled' })
    .eq('id', jobId);
  return { error };
}

// ── DELIVERY JOBS ────────────────────────────────────────────

export async function getDeliveryJob(jobId) {
  const { data, error } = await supabase
    .from('delivery_jobs')
    .select('*')
    .eq('id', jobId)
    .single();
  return { data, error };
}

export async function acceptDeliveryJob({ jobId, driverId, driverLat, driverLng }) {
  const { data, error } = await supabase
    .from('delivery_jobs')
    .update({
      driver_id: driverId,
      driver_lat: driverLat,
      driver_lng: driverLng,
      status: 'out_for_delivery',
    })
    .eq('id', jobId)
    .eq('status', 'accepted')
    .select()
    .single();
  return { data, error };
}

export async function markDeliveryCompleteDriver(jobId) {
  const { error } = await supabase
    .from('delivery_jobs')
    .update({ driver_complete: true, status: 'delivered' })
    .eq('id', jobId);
  return { error };
}

export async function markDeliveryCompleteClient(jobId) {
  const { error } = await supabase
    .from('delivery_jobs')
    .update({ client_complete: true })
    .eq('id', jobId);
  return { error };
}

// ── STORE DELIVERY ORDERS ────────────────────────────────────

export async function getOpenDeliveryOrders(storeId) {
  const { data, error } = await supabase
    .from('delivery_jobs')
    .select('id, status, order_total, items, created_at')
    .eq('store_id', storeId)
    .in('status', ['pending', 'accepted', 'out_for_delivery'])
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function getClosedDeliveryOrders(storeId) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('delivery_jobs')
    .select('id, status, order_total, items, created_at')
    .eq('store_id', storeId)
    .in('status', ['delivered', 'canceled', 'returned'])
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function getDeliveryOrderDetail(jobId) {
  const { data, error } = await supabase
    .from('delivery_jobs')
    .select('*')
    .eq('id', jobId)
    .single();
  return { data, error };
}

export async function markOrderReady(jobId, orderTotal, updatedItems) {
  const fields = { status: 'accepted', order_total: Number(orderTotal) };
  if (updatedItems) fields.items = updatedItems;
  const { error } = await supabase
    .from('delivery_jobs')
    .update(fields)
    .eq('id', jobId)
    .eq('status', 'pending');
  return { error };
}

export async function cancelDeliveryOrder(jobId, reason) {
  const { error } = await supabase
    .from('delivery_jobs')
    .update({ status: 'canceled', cancel_reason: reason })
    .eq('id', jobId)
    .in('status', ['pending', 'accepted']);
  return { error };
}

export async function assignPreferredDriver(jobId, driverId) {
  const { data: profile } = await supabase
    .from('driver_profiles')
    .select('last_known_lat, last_known_lng')
    .eq('id', driverId)
    .single();

  const { data, error } = await supabase
    .from('delivery_jobs')
    .update({
      driver_id: driverId,
      driver_lat: profile?.last_known_lat ?? null,
      driver_lng: profile?.last_known_lng ?? null,
      status: 'out_for_delivery',
    })
    .eq('id', jobId)
    .eq('status', 'accepted')
    .select()
    .single();
  return { data, error };
}

export async function markDeliveryPaid(jobId) {
  const { error } = await supabase
    .from('delivery_jobs')
    .update({ store_paid: true })
    .eq('id', jobId);
  return { error };
}

export async function addPreferredDriver(storeId, driverId) {
  const { error } = await supabase
    .from('preferred_drivers')
    .insert({ store_id: storeId, driver_id: driverId });
  // code '23505' = unique_violation → driver already preferred, treat as success
  if (error && error.code !== '23505') return { error };
  return { error: null };
}

export async function removePreferredDriver(storeId, driverId) {
  const { error } = await supabase
    .from('preferred_drivers')
    .delete()
    .eq('store_id', storeId)
    .eq('driver_id', driverId);
  return { error };
}

export async function getReadyPreferredDrivers(storeId) {
  // SECURITY DEFINER RPC — the 3-query chain fails because accounts RLS
  // blocks reading rows where id ≠ auth.uid(). The RPC bypasses that.
  // ready_for_rides filter removed: preferred drivers are trusted by the store
  // and should always appear so the store can contact / assign them directly.
  const { data, error } = await supabase
    .rpc('get_preferred_drivers_for_store', { p_store_id: storeId });

  return { data: data ?? [], error };
}

// ── STORE ITEMS ───────────────────────────────────────────────

export async function getStoreItems(storeId) {
  const { data, error } = await supabase
    .from('store_items')
    .select('*')
    .eq('store_id', storeId)
    .order('name');
  return { data, error };
}

export async function upsertStoreItem({ id, storeId, name, price, stockCount, imageUrl }) {
  const fields = {
    store_id:        storeId,
    name:            String(name).trim(),
    price:           Number(price),
    inventory_count: Number(stockCount),
    // is_available is managed by DB trigger — never set from client
  };

  // Only include image_url when it was explicitly provided (undefined = leave as-is)
  if (imageUrl !== undefined) fields.image_url = imageUrl;

  if (id) {
    const { data, error } = await supabase
      .from('store_items')
      .update(fields)
      .eq('id', id)
      .eq('store_id', storeId)
      .select()
      .single();
    return { data, error };
  }

  const { data, error } = await supabase
    .from('store_items')
    .insert(fields)
    .select()
    .single();
  return { data, error };
}

// base64 comes from ImageManipulator.manipulateAsync(..., { base64: true }).base64
export async function uploadProductImage(storeId, itemId, base64) {
  const path = `${storeId}/${itemId}.jpg`;

  // Decode base64 → Uint8Array (no native modules needed — pure JS)
  const binaryStr = atob(base64);
  const bytes     = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const { error } = await supabase.storage
    .from('store-products')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

  if (error) return { url: null, error };

  const { data } = supabase.storage
    .from('store-products')
    .getPublicUrl(path);

  return { url: data.publicUrl, error: null };
}

export async function deleteStoreItem(itemId) {
  const { error } = await supabase
    .from('store_items')
    .delete()
    .eq('id', itemId);
  return { error };
}

export async function hasOutOfStockItems(storeId) {
  const { data, error } = await supabase
    .from('store_items')
    .select('id')
    .eq('store_id', storeId)
    .eq('inventory_count', 0)
    .limit(1);
  return { hasOutOfStock: (data?.length ?? 0) > 0, error };
}

// ── DRIVER STATUS ────────────────────────────────────────────

export async function setDriverReady(driverId, lat, lng) {
  const { error } = await supabase
    .from('driver_profiles')
    .update({
      ready_for_rides: true,
      last_known_lat: lat,
      last_known_lng: lng,
      location_updated_at: new Date().toISOString(),
      consecutive_refusals: 0,
    })
    .eq('id', driverId);
  return { error };
}

export async function setDriverNotReady(driverId) {
  const { error } = await supabase
    .from('driver_profiles')
    .update({ ready_for_rides: false })
    .eq('id', driverId);
  return { error };
}

export async function incrementDriverRefusals(driverId) {
  // Fetch current count then check against limit
  const { data } = await supabase
    .from('driver_profiles')
    .select('consecutive_refusals')
    .eq('id', driverId)
    .single();

  const newCount = (data?.consecutive_refusals || 0) + 1;
  const limitReached = newCount >= 3;

  await supabase
    .from('driver_profiles')
    .update({
      consecutive_refusals: newCount,
      ready_for_rides: limitReached ? false : true,
    })
    .eq('id', driverId);

  return { limitReached };
}

// ── STORE STOREFRONT PHOTO ────────────────────────────────────

// base64 string from ImageManipulator; uploads to store-fronts/{userId}/storefront.jpg
export async function uploadStorefrontPhoto(userId, base64) {
  const path = `${userId}/storefront.jpg`;

  const binaryStr = atob(base64);
  const bytes     = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const { error } = await supabase.storage
    .from('store-fronts')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

  if (error) return { url: null, error };

  const { data } = supabase.storage
    .from('store-fronts')
    .getPublicUrl(path);

  return { url: data.publicUrl, error: null };
}

// ── DRIVER RATINGS ───────────────────────────────────────────

export async function submitDriverRating({ driverId, clientId, rideJobId, rating, comment, isReport }) {
  const { error } = await supabase
    .from('driver_ratings')
    .insert({
      driver_id:   driverId,
      client_id:   clientId,
      ride_job_id: rideJobId,
      rating,
      comment:     comment ?? null,
      is_report:   isReport ?? false,
    });
  return { error };
}

export async function getDriverAverageRating(driverId) {
  const { data, error } = await supabase
    .from('driver_ratings')
    .select('rating')
    .eq('driver_id', driverId);
  if (error || !data?.length) return { average: null, count: 0, error };
  const average = data.reduce((sum, r) => sum + r.rating, 0) / data.length;
  return { average: Math.round(average * 10) / 10, count: data.length, error: null };
}

// ── EDGE FUNCTION DISPATCH ────────────────────────────────────

/**
 * Invoke the dispatch-job Edge Function non-blocking.
 * Finds nearby available drivers and sends them an Expo push notification.
 * Fire-and-forget: call without await so it never delays the UI.
 */
export function dispatchJob(jobId, jobType, excludeDriverIds = []) {
  return supabase.functions.invoke('dispatch-job', {
    body: { job_id: jobId, job_type: jobType, exclude_driver_ids: excludeDriverIds },
  });
}

export function notifyAssignedDriver(jobId, driverId) {
  return supabase.functions.invoke('notify-driver', {
    body: { job_id: jobId, driver_id: driverId },
  });
}

export function notifyClientArrival(jobId, jobType) {
  return supabase.functions.invoke('notify-client-arrival', {
    body: { job_id: jobId, job_type: jobType },
  });
}

export function notifyDriverUnassigned(jobId, driverId) {
  return supabase.functions.invoke('notify-driver', {
    body: { job_id: jobId, driver_id: driverId, type: 'delivery_unassigned' },
  });
}

export async function unassignDeliveryDriver(jobId) {
  const { data, error } = await supabase
    .from('delivery_jobs')
    .update({ driver_id: null, driver_lat: null, driver_lng: null, status: 'accepted' })
    .eq('id', jobId)
    .select()
    .single();
  return { data, error };
}
