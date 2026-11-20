import React, { useCallback } from 'react';
import {
  createBottomTabNavigator,
  type BottomTabScreenProps,
} from '@react-navigation/bottom-tabs';
import { Calendar, House, User, Users } from 'lucide-react-native';
import AppointmentsScreen from '../screens/common/AppointmentsScreen';
import PatientListScreen from '../screens/common/PatientListScreen';
import ProfileScreen from '../screens/common/ProfileScreen';
import DoctorDashboardScreen from '../screens/doctor/DoctorDashboardScreen';
import { colors } from '../theme/colors';
import type { DoctorTabParamList } from './types';

const Tab = createBottomTabNavigator<DoctorTabParamList>();

type TabIconProps = { color: string; size: number };
const homeIcon = ({ color, size }: TabIconProps) => (
  <House color={color} size={size} />
);
const patientsIcon = ({ color, size }: TabIconProps) => (
  <Users color={color} size={size} />
);
const scheduleIcon = ({ color, size }: TabIconProps) => (
  <Calendar color={color} size={size} />
);
const profileIcon = ({ color, size }: TabIconProps) => (
  <User color={color} size={size} />
);

/** The doctor's patients today, live. */
function DoctorPatientsScreen({
  navigation,
}: BottomTabScreenProps<DoctorTabParamList, 'Patients'>) {
  const onFocus = useCallback(
    (callback: () => void) => navigation.addListener('focus', callback),
    [navigation],
  );
  return (
    <PatientListScreen
      viewer="doctor"
      onBack={() => navigation.navigate('Home')}
      onAddPatient={() => navigation.getParent()?.navigate('AddPatient')}
      onFocus={onFocus}
    />
  );
}
/** The doctor's own appointments, live. */
const DoctorScheduleScreen = () => <AppointmentsScreen />;
/** Doctors can add doctors and assistants from their profile. */
function DoctorProfileScreen({
  navigation,
}: BottomTabScreenProps<DoctorTabParamList, 'Profile'>) {
  return (
    <ProfileScreen
      onAddStaff={() => navigation.getParent()?.navigate('AddStaff')}
    />
  );
}

export default function DoctorTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
        tabBarStyle: { borderTopColor: colors.border },
      }}
    >
      <Tab.Screen
        name="Home"
        component={DoctorDashboardScreen}
        options={{ tabBarIcon: homeIcon }}
      />
      <Tab.Screen
        name="Patients"
        component={DoctorPatientsScreen}
        options={{ tabBarIcon: patientsIcon }}
      />
      <Tab.Screen
        name="Schedule"
        component={DoctorScheduleScreen}
        options={{ tabBarIcon: scheduleIcon }}
      />
      <Tab.Screen
        name="Profile"
        component={DoctorProfileScreen}
        options={{ tabBarIcon: profileIcon }}
      />
    </Tab.Navigator>
  );
}
