import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Modal, ActivityIndicator
} from 'react-native';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { t } from '../../i18n';

const AWARD_KEYS = [
  'rides_1', 'rides_10', 'rides_100', 'rides_1000',
  'deliveries_1', 'deliveries_10', 'deliveries_100', 'deliveries_1000',
  'distance_dr_ns', 'distance_dr_ew', 'distance_dr_miami', 'distance_dr_nyc', 'distance_moon',
];

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
      Alert.alert(t('driverStats.error'), t('driverStats.boostError'));
      return;
    }

    await fetchStats();
    Alert.alert(
      t('driverStats.boostActivated'),
      t('driverStats.boostActivatedMsg'),
      [{ text: t('driverStats.letsGo') }]
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
          <Text style={styles.adTitle}>{t('driverStats.watchAd')}</Text>
          <Text style={styles.adSubtitle}>{t('shared.adRewarded')}</Text>
          <Text style={styles.adNote}>
            Replace with your rewarded ad SDK.{'\n'}
            Call handleRewardedAdComplete() when the ad finishes.
          </Text>
          <TouchableOpacity style={styles.adButton} onPress={handleRewardedAdComplete}>
            <Text style={styles.adButtonText}>{t('shared.adComplete')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>{t('shared.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('driverStats.title')}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.total_rides ?? 0}</Text>
            <Text style={styles.statLabel}>{t('driverStats.rides')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.total_deliveries ?? 0}</Text>
            <Text style={styles.statLabel}>{t('driverStats.deliveries')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {stats?.distance_km ? Number(stats.distance_km).toFixed(0) : 0}
            </Text>
            <Text style={styles.statLabel}>{t('driverStats.kmTraveled')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.days_worked ?? 0}</Text>
            <Text style={styles.statLabel}>{t('driverStats.daysWorked')}</Text>
          </View>
        </View>

        {/* 2× boost */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('driverStats.weeklyBoost')}</Text>
          {multiplierActive ? (
            <View style={styles.boostActive}>
              <Text style={styles.boostActiveText}>{t('driverStats.boostActive')}</Text>
            </View>
          ) : rewardedAvailable ? (
            <TouchableOpacity
              style={styles.boostBtn}
              onPress={() => setShowRewardedAd(true)}
              disabled={rewardedLoading}
            >
              <Text style={styles.boostBtnText}>{t('driverStats.watchAd')}</Text>
              <Text style={styles.boostBtnSub}>{t('driverStats.oncePerWeek')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.boostUsed}>
              <Text style={styles.boostUsedText}>
                {daysUntilReset() !== 1
                  ? t('driverStats.boostUsedPlural', { days: daysUntilReset() })
                  : t('driverStats.boostUsed', { days: daysUntilReset() })}
              </Text>
            </View>
          )}
        </View>

        {/* Awards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('driverStats.awards')} ({awards.length}/{AWARD_KEYS.length})
          </Text>
          {AWARD_KEYS.map(key => {
            const earned = awards.find(a => a.award_key === key);
            return (
              <View key={key} style={[styles.awardRow, !earned && styles.awardRowLocked]}>
                <Text style={styles.awardIcon}>{earned ? t('awards.' + key + '.icon') : '🔒'}</Text>
                <View style={styles.awardInfo}>
                  <Text style={[styles.awardLabel, !earned && styles.awardLabelLocked]}>
                    {t('awards.' + key + '.label')}
                  </Text>
                  <Text style={styles.awardDesc}>{t('awards.' + key + '.desc')}</Text>
                  {earned && (
                    <Text style={styles.awardDate}>
                      {t('driverStats.earned', { date: new Date(earned.awarded_at).toLocaleDateString() })}
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
