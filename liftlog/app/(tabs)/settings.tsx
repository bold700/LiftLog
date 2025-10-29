import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWorkoutStore } from '../../src/store/useWorkout';
import { i18n, getCurrentLocale, setLocale } from '../../src/i18n';
import { Unit } from '../../src/types';
import * as Notifications from 'expo-notifications';

export default function SettingsScreen() {
  const { profile, syncNow, isSyncing, syncError, loadProfile } = useWorkoutStore();
  const [name, setName] = useState(profile?.full_name || '');
  const [unit, setUnit] = useState<Unit>(profile?.unit || 'kg');
  const [language, setLanguage] = useState<'nl' | 'en'>(getCurrentLocale());
  const [remindersEnabled, setRemindersEnabled] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.full_name || '');
      setUnit(profile.unit);
    }
  }, [profile]);

  const handleUpdateProfile = async () => {
    if (!profile) return;
    
    // Update local profile
    await useWorkoutStore.getState().loadProfile(profile.id);
    // In production, sync to Supabase
  };

  const handleSync = async () => {
    await syncNow();
    if (syncError) {
      Alert.alert(i18n.t('error'), syncError);
    } else {
      Alert.alert(i18n.t('synced'), 'Data gesynchroniseerd');
    }
  };

  const handleExportData = async () => {
    Alert.alert('Info', 'Export functionaliteit - zie Share tab');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Profile */}
        <Text style={styles.sectionTitle}>{i18n.t('profile')}</Text>
        <View style={styles.section}>
          <Text style={styles.label}>Naam</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Jouw naam"
            placeholderTextColor="#6B7280"
            onSubmitEditing={handleUpdateProfile}
          />
        </View>

        {/* Units */}
        <Text style={styles.sectionTitle}>{i18n.t('units')}</Text>
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.unitOption, unit === 'kg' && styles.unitOptionActive]}
            onPress={() => setUnit('kg')}
          >
            <Text style={[styles.unitOptionText, unit === 'kg' && styles.unitOptionTextActive]}>
              {i18n.t('kg')}
            </Text>
            {unit === 'kg' && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.unitOption, unit === 'lb' && styles.unitOptionActive]}
            onPress={() => setUnit('lb')}
          >
            <Text style={[styles.unitOptionText, unit === 'lb' && styles.unitOptionTextActive]}>
              {i18n.t('lb')}
            </Text>
            {unit === 'lb' && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
        </View>

        {/* Language */}
        <Text style={styles.sectionTitle}>{i18n.t('language')}</Text>
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.languageOption, language === 'nl' && styles.languageOptionActive]}
            onPress={() => {
              setLanguage('nl');
              setLocale('nl');
              i18n.setLocale('nl');
            }}
          >
            <Text
              style={[
                styles.languageOptionText,
                language === 'nl' && styles.languageOptionTextActive,
              ]}
            >
              Nederlands
            </Text>
            {language === 'nl' && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.languageOption, language === 'en' && styles.languageOptionActive]}
            onPress={() => {
              setLanguage('en');
              setLocale('en');
              i18n.setLocale('en');
            }}
          >
            <Text
              style={[
                styles.languageOptionText,
                language === 'en' && styles.languageOptionTextActive,
              ]}
            >
              English
            </Text>
            {language === 'en' && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
        </View>

        {/* Reminders */}
        <Text style={styles.sectionTitle}>{i18n.t('reminders')}</Text>
        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Herinneringen inschakelen</Text>
            <Switch
              value={remindersEnabled}
              onValueChange={setRemindersEnabled}
              trackColor={{ false: '#374151', true: '#00D3FF' }}
              thumbColor="#F3F4F6"
            />
          </View>
          <Text style={styles.toggleDescription}>
            Ontvang notificaties om je training te loggen
          </Text>
        </View>

        {/* Sync */}
        <Text style={styles.sectionTitle}>{i18n.t('sync')}</Text>
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
            onPress={handleSync}
            disabled={isSyncing}
          >
            <Text style={styles.syncButtonText}>
              {isSyncing ? i18n.t('syncing') : i18n.t('sync')}
            </Text>
          </TouchableOpacity>
          {syncError && <Text style={styles.errorText}>{syncError}</Text>}
        </View>

        {/* Export */}
        <Text style={styles.sectionTitle}>{i18n.t('export_data')}</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.exportButton} onPress={handleExportData}>
            <Text style={styles.exportButtonText}>{i18n.t('export_csv')}</Text>
          </TouchableOpacity>
        </View>

        {/* Privacy */}
        <Text style={styles.sectionTitle}>{i18n.t('privacy')}</Text>
        <View style={styles.section}>
          <Text style={styles.privacyText}>
            Je data wordt lokaal opgeslagen en gesynchroniseerd met Supabase wanneer je online bent.
            Alle data is versleuteld en alleen jij (en je trainer als je dit hebt ingeschakeld) hebben toegang.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>LiftLog v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F14',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    color: '#F3F4F6',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 12,
  },
  section: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  label: {
    color: '#D1D5DB',
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1F2937',
    borderRadius: 8,
    padding: 12,
    color: '#F3F4F6',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  unitOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#1F2937',
    marginBottom: 8,
  },
  unitOptionActive: {
    backgroundColor: '#00D3FF',
  },
  unitOptionText: {
    color: '#F3F4F6',
    fontSize: 16,
    fontWeight: '600',
  },
  unitOptionTextActive: {
    color: '#0B0F14',
  },
  languageOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#1F2937',
    marginBottom: 8,
  },
  languageOptionActive: {
    backgroundColor: '#00D3FF',
  },
  languageOptionText: {
    color: '#F3F4F6',
    fontSize: 16,
    fontWeight: '600',
  },
  languageOptionTextActive: {
    color: '#0B0F14',
  },
  checkmark: {
    color: '#0B0F14',
    fontSize: 18,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  toggleLabel: {
    color: '#F3F4F6',
    fontSize: 16,
    fontWeight: '600',
  },
  toggleDescription: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 4,
  },
  syncButton: {
    backgroundColor: '#00D3FF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  syncButtonDisabled: {
    opacity: 0.5,
  },
  syncButtonText: {
    color: '#0B0F14',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 8,
  },
  exportButton: {
    backgroundColor: '#374151',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  exportButtonText: {
    color: '#F3F4F6',
    fontSize: 16,
    fontWeight: '700',
  },
  privacyText: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 16,
  },
  footerText: {
    color: '#6B7280',
    fontSize: 12,
  },
});


