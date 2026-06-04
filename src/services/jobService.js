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

export async function markRideCompleteDriver(jobId) {
  const { error } = await supabase
    .from('ride_jobs')
    .update({ driver_complete: true, status: 'complete' })
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
