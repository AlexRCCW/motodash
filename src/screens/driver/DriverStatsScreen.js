import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { useThemeColors, SlashDivider, radius } from '../../theme';
import { t } from '../../i18n';
import { showRewarded } from '../../services/adService';

const AWARD_KEYS = [
  'rides_1', 'rides_10', 'rides_100', 'rides_1000',
  'deliveries_1', 'deliveries_10', 'deliveries_100', 'deliveries_1000',
  'distance_dr_ns', 'distance_dr_ew', 'distance_dr_miami', 'distance_dr_nyc', 'distance_moon',
];

export default function DriverStatsScreen({ navigation }) {
  const { account } = useAuth();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [stats, setStats]             = useState(null);
  const [awards, setAwards]           = useState([]);
  const [loading, setLoading]         = useState(true);
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

  async function handleBoostPress() {
    setRewardedLoading(true);
    await showRewarded();

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
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const rewardedAvailable = isRewardedAvailable();
  const multiplierActive = stats?.multiplier_active_date === new Date().toISOString().split('T')[0]
    && stats?.distance_multiplier > 1;

  return (
    <View style={styles.root}>

      {/* ── Hero panel ── */}
      <SafeAreaView style={styles.hero} edges={['top']}>
        <View style={styles.heroHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.heroBackBtn}>
            <Text style={styles.heroBackText}>{t('shared.back').toUpperCase()}</Text>
          </TouchableOpacity>
          <Text style={styles.heroTitle}>{t('driverStats.title').toUpperCase()}</Text>
          <View style={{ width: 60 }} />
        </View>
      </SafeAreaView>

      {/* ── Red slash divider ── */}
      <SlashDivider />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.total_rides ?? 0}</Text>
            <Text style={styles.statLabel}>{t('driverStats.rides').toUpperCase()}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.total_deliveries ?? 0}</Text>
            <Text style={styles.statLabel}>{t('driverStats.deliveries').toUpperCase()}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {stats?.distance_km ? Number(stats.distance_km).toFixed(0) : 0}
            </Text>
            <Text style={styles.statLabel}>{t('driverStats.kmTraveled').toUpperCase()}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.days_worked ?? 0}</Text>
            <Text style={styles.statLabel}>{t('driverStats.daysWorked').toUpperCase()}</Text>
          </View>
        </View>

        {/* 2× boost */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('driverStats.weeklyBoost').toUpperCase()}</Text>
          {multiplierActive ? (
            <View style={styles.boostActive}>
              <Text style={styles.boostActiveText}>{t('driverStats.boostActive').toUpperCase()}</Text>
            </View>
          ) : rewardedAvailable ? (
            <TouchableOpacity
              style={styles.boostBtn}
              onPress={handleBoostPress}
              disabled={rewardedLoading}
            >
              <Text style={styles.boostBtnText}>{t('driverStats.watchAd').toUpperCase()}</Text>
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
            {t('driverStats.awards').toUpperCase()} ({awards.length}/{AWARD_KEYS.length})
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

const makeStyles = (colors) => StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  centered:{ flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Hero panel ──
  hero: { backgroundColor: colors.hero, paddingBottom: 14 },
  heroHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingHorizontal: 16,
    paddingTop:     10,
    paddingBottom:  4,
  },
  heroTitle:    { fontSize: 16, fontWeight: '500', color: colors.onDark, letterSpacing: 2 },
  heroBackBtn:  { width: 60 },
  heroBackText: { fontSize: 11, fontWeight: '500', color: colors.mutedOnDark, letterSpacing: 1.5 },

  scroll:   { flex: 1 },
  content:  { padding: 16, paddingBottom: 40 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statCard: {
    flex:            1,
    minWidth:        '45%',
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         16,
    alignItems:      'center',
  },
  statValue: {
    fontSize:   28,
    fontWeight: '500',
    color:      colors.primary,
    letterSpacing: 1,
  },
  statLabel: {
    fontSize:      11,
    color:         colors.textSecondary,
    marginTop:     6,
    letterSpacing:  1.5,
    fontWeight:    '500',
    textTransform: 'uppercase',
  },

  section:      { marginBottom: 24 },
  sectionTitle: {
    fontSize:      12,
    fontWeight:    '500',
    color:         colors.textPrimary,
    marginBottom:  12,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },

  boostActive: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    padding:         16,
  },
  boostActiveText: {
    color:         colors.primary,
    fontWeight:    '500',
    fontSize:      13,
    letterSpacing:  1.5,
  },
  boostBtn: {
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    padding:         16,
    alignItems:      'center',
  },
  boostBtnText: {
    color:         colors.onDark,
    fontWeight:    '500',
    fontSize:      13,
    letterSpacing:  2,
  },
  boostBtnSub: {
    color:      'rgba(255,255,255,0.6)',
    fontSize:   12,
    marginTop:  4,
  },
  boostUsed: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         16,
  },
  boostUsedText: { color: colors.textSecondary, fontSize: 14 },

  awardRow: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor:     colors.border,
  },
  awardRowLocked:   { opacity: 0.4 },
  awardIcon:        { fontSize: 28, width: 44 },
  awardInfo:        { flex: 1 },
  awardLabel:       { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  awardLabelLocked: { color: colors.textSecondary },
  awardDesc:        { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  awardDate:        { fontSize: 12, color: colors.primary, marginTop: 2 },

  // ── Ad modal ──
  adContainer: {
    flex:            1,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: colors.hero,
    padding:         32,
  },
  adTitle: {
    fontSize:      18,
    fontWeight:    '500',
    color:         colors.onDark,
    letterSpacing:  2,
    marginBottom:   8,
    textAlign:     'center',
  },
  adSubtitle: {
    fontSize:     14,
    color:        colors.mutedOnDark,
    marginBottom: 16,
    textAlign:    'center',
  },
  adNote: {
    fontSize:     13,
    color:        colors.mutedOnDark,
    textAlign:    'center',
    marginBottom: 32,
    lineHeight:   20,
  },
  adButton: {
    backgroundColor:   colors.primary,
    borderRadius:       radius.md,
    paddingVertical:   14,
    paddingHorizontal: 40,
    alignItems:        'center',
    width:             '100%',
  },
  adButtonText: {
    color:         colors.onDark,
    fontSize:      13,
    fontWeight:    '500',
    letterSpacing:  2,
  },
});
