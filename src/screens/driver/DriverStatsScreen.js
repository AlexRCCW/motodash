import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Modal, ActivityIndicator
} from 'react-native';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';

const AWARD_LABELS = {
  rides_1:          { label: 'First ride',          icon: '🏍️', desc: 'Completed your first ride' },
  rides_10:         { label: '10 rides',             icon: '🔟', desc: '10 rides completed' },
  rides_100:        { label: '100 rides',            icon: '💯', desc: '100 rides completed' },
  rides_1000:       { label: '1,000 rides',          icon: '🏆', desc: '1,000 rides completed' },
  deliveries_1:     { label: 'First delivery',       icon: '📦', desc: 'Completed your first delivery' },
  deliveries_10:    { label: '10 deliveries',        icon: '📫', desc: '10 deliveries completed' },
  deliveries_100:   { label: '100 deliveries',       icon: '🚀', desc: '100 deliveries completed' },
  deliveries_1000:  { label: '1,000 deliveries',     icon: '🌟', desc: '1,000 deliveries completed' },
  distance_dr_ns:   { label: 'DR North–South',       icon: '🗺️', desc: 'Traveled 280 km — the length of the DR' },
  distance_dr_ew:   { label: 'DR East–West',         icon: '🧭', desc: 'Traveled 390 km — the width of the DR' },
  distance_dr_miami:{ label: 'DR to Miami',          icon: '✈️', desc: 'Traveled 1,700 km to Miami' },
  distance_dr_nyc:  { label: 'DR to New York',       icon: '🗽', desc: 'Traveled 2,600 km to New York' },
  distance_moon:    { label: 'To the Moon',          icon: '🌙', desc: 'Traveled 384,400 km to the Moon' },
};

export default function DriverStatsScreen({ navigation }) {
  const { account } = useAuth();
  const [stats, setStats]             = useState(null);
  const [awards, setAwards]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showRewardedAd, setShowRewardedAd] = useState(false);
  const [rewardedLoading, setRewardedLoading] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    setLoading(true);
    const [statsRes, awardsRes] = await Promise.all([
      supabase.from('driver_stats').select('*').eq('id', account.id).single(),
      supabase.from('driver_awards').select('*').eq('driver_id', account.id).order('awarded_at'),
    ]);
    if (statsRes.data) setStats(statsRes.data);
    if (awardsRes.data) setAwards(awardsRes.data);
    setLoading(false);
  }

  function isRewardedAvailable() {
    if (!stats) return false;
    if (!stats.rewarded_used_week) return true;
    // Check if rewarded_week_of is from a previous Mon–Sun week
    if (!stats.rewarded_week_of) return true;
    const weekOf = new Date(stats.rewarded_week_of);
    const now = new Date();
    // Get Monday of current week
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    return weekOf < monday;
  }

  function daysUntilReset() {
    const now = new Date();
    const day = now.getDay();
    const daysUntilMonday = day === 0 ? 1 : 8 - day;
    return daysUntilMonday;
  }

  async function handleRewardedAdComplete() {
    setShowRewardedAd(false);
    setRewardedLoading(true);

    const today = new Date().toISOString().split('T')[0];
    const monday = (() => {
      const d = new Date();
      const day = d.getDay();
      d.setDate(d.getDate() - ((day + 6) % 7));
      return d.toISOString().split('T')[0];
    })();

    const { error } = await supabase
      .from('driver_stats')
      .update({
        distance_multiplier: 2.0,
        multiplier_active_date: today,
        rewarded_used_week: true,
        rewarded_week_of: monday,
      })
      .eq('id', account.id);

    setRewardedLoading(false);

    if (error) {
      Alert.alert('Error', 'Could not activate your boost. Please try again.');
      return;
    }

    await fetchStats();
    Alert.alert(
      '2× boost active! 🚀',
      'All distances you travel today count double toward your milestones.',
      [{ text: 'Let\'s go!' }]
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const rewardedAvailable = isRewardedAvailable();
  const multiplierActive = stats?.multiplier_active_date === new Date().toISOString().split('T')[0]
    && stats?.distance_multiplier > 1;

  return (
    <View style={styles.container}>

      {/* Rewarded ad modal */}
      <Modal visible={showRewardedAd} animationType="slide" transparent={false}>
        <View style={styles.adContainer}>
          <Text style={styles.adTitle}>Watch to activate 2× boost</Text>
          <Text style={styles.adSubtitle}>Rewarded video ad shown here</Text>
          <Text style={styles.adNote}>
            Replace with your rewarded ad SDK.{'\n'}
            Call handleRewardedAdComplete() when the ad finishes.
          </Text>
          <TouchableOpacity style={styles.adButton} onPress={handleRewardedAdComplete}>
            <Text style={styles.adButtonText}>Ad complete — Activate boost</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My stats</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.total_rides ?? 0}</Text>
            <Text style={styles.statLabel}>Rides</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.total_deliveries ?? 0}</Text>
            <Text style={styles.statLabel}>Deliveries</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {stats?.distance_km ? Number(stats.distance_km).toFixed(0) : 0}
            </Text>
            <Text style={styles.statLabel}>Km traveled</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.days_worked ?? 0}</Text>
            <Text style={styles.statLabel}>Days worked</Text>
          </View>
        </View>

        {/* 2× boost */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly 2× distance boost</Text>
          {multiplierActive ? (
            <View style={styles.boostActive}>
              <Text style={styles.boostActiveText}>
                🚀 2× boost is active today! All distances count double.
              </Text>
            </View>
          ) : rewardedAvailable ? (
            <TouchableOpacity
              style={styles.boostBtn}
              onPress={() => setShowRewardedAd(true)}
              disabled={rewardedLoading}
            >
              <Text style={styles.boostBtnText}>
                Watch ad to activate 2× boost
              </Text>
              <Text style={styles.boostBtnSub}>Available once per week</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.boostUsed}>
              <Text style={styles.boostUsedText}>
                ✓ Used this week — resets in {daysUntilReset()} day{daysUntilReset() !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Awards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Awards ({awards.length}/{Object.keys(AWARD_LABELS).length})
          </Text>
          {Object.entries(AWARD_LABELS).map(([key, award]) => {
            const earned = awards.find(a => a.award_key === key);
            return (
              <View key={key} style={[styles.awardRow, !earned && styles.awardRowLocked]}>
                <Text style={styles.awardIcon}>{earned ? award.icon : '🔒'}</Text>
                <View style={styles.awardInfo}>
                  <Text style={[styles.awardLabel, !earned && styles.awardLabelLocked]}>
                    {award.label}
                  </Text>
                  <Text style={styles.awardDesc}>{award.desc}</Text>
                  {earned && (
                    <Text style={styles.awardDate}>
                      Earned {new Date(earned.awarded_at).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#fff' },
  centered:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderColor: '#eee' },
  back:             { color: '#2563eb', fontSize: 16, width: 60 },
  headerTitle:      { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  content:          { padding: 16, paddingBottom: 40 },
  statsGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statCard:         { flex: 1, minWidth: '45%', backgroundColor: '#f8fafc', borderRadius: 12, padding: 16, alignItems: 'center' },
  statValue:        { fontSize: 28, fontWeight: '700', color: '#2563eb' },
  statLabel:        { fontSize: 13, color: '#6b7280', marginTop: 4 },
  section:          { marginBottom: 24 },
  sectionTitle:     { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
  boostActive:      { backgroundColor: '#dcfce7', borderRadius: 12, padding: 16 },
  boostActiveText:  { color: '#166534', fontWeight: '600', fontSize: 15 },
  boostBtn:         { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center' },
  boostBtnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
  boostBtnSub:      { color: '#bfdbfe', fontSize: 12, marginTop: 4 },
  boostUsed:        { backgroundColor: '#f3f4f6', borderRadius: 12, padding: 16 },
  boostUsedText:    { color: '#6b7280', fontSize: 14 },
  awardRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f3f4f6' },
  awardRowLocked:   { opacity: 0.5 },
  awardIcon:        { fontSize: 28, width: 44 },
  awardInfo:        { flex: 1 },
  awardLabel:       { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  awardLabelLocked: { color: '#9ca3af' },
  awardDesc:        { fontSize: 13, color: '#6b7280', marginTop: 2 },
  awardDate:        { fontSize: 12, color: '#2563eb', marginTop: 2 },
  adContainer:      { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 32 },
  adTitle:          { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 8, textAlign: 'center' },
  adSubtitle:       { fontSize: 16, color: '#9ca3af', marginBottom: 24 },
  adNote:           { fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  adButton:         { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', width: '100%' },
  adButtonText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
});
