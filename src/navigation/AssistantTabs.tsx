import React, { useCallback } from 'react';
import {
  createBottomTabNavigator,
  type BottomTabScreenProps,
} from '@react-navigation/bottom-tabs';
import { CalendarDays, Clock, LayoutGrid, Users } from 'lucide-react-native';
import AppointmentsScreen from '../screens/common/AppointmentsScreen';
import PatientListScreen from '../screens/common/PatientListScreen';
import {
  AssistantDeskProvider,
  useAssistantDesk,
} from '../screens/assistant/AssistantDeskContext';
import AssistantDashboardScreen from '../screens/assistant/AssistantDashboardScreen';
import TokensScreen from '../screens/assistant/TokensScreen';
import { colors } from '../theme/colors';
import type { AssistantTabParamList } from './types';

const Tab = createBottomTabNavigator<AssistantTabParamList>();

type TabIconProps = { color: string; size: number };
const deskIcon = ({ color, size }: TabIconProps) => (
  <LayoutGrid color={color} size={size} />
);
const tokensIcon = ({ color, size }: TabIconProps) => (
  <Clock color={color} size={size} />
);
const bookingsIcon = ({ color, size }: TabIconProps) => (
  <CalendarDays color={color} size={size} />
);
const patientsIcon = ({ color, size }: TabIconProps) => (
  <Users color={color} size={size} />
);

function TokensTab({
  navigation,
}: BottomTabScreenProps<AssistantTabParamList, 'Tokens'>) {
  return <TokensScreen onBack={() => navigation.navigate('Desk')} />;
}
/** Appointments of the doctors this assistant works for, live. */
const BookingsScreen = () => <AppointmentsScreen />;
/** Today's patients of the doctors this assistant works for, live. */
function PatientsScreen({
  navigation,
}: BottomTabScreenProps<AssistantTabParamList, 'Patients'>) {
  const { desk } = useAssistantDesk();
  const onFocus = useCallback(
    (callback: () => void) => navigation.addListener('focus', callback),
    [navigation],
  );
  return (
    <PatientListScreen
      viewer="assistant"
      place={desk.deskName || undefined}
      onBack={() => navigation.navigate('Desk')}
      onAddPatient={() => navigation.getParent()?.navigate('AddPatient')}
      onFocus={onFocus}
    />
  );
}

/** All assistant tabs share one front-desk state (today's queues). */
export default function AssistantTabs() {
  return (
    <AssistantDeskProvider>
      <AssistantTabNavigator />
    </AssistantDeskProvider>
  );
}

function AssistantTabNavigator() {
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
        name="Desk"
        component={AssistantDashboardScreen}
        options={{ tabBarIcon: deskIcon }}
      />
      <Tab.Screen
        name="Tokens"
        component={TokensTab}
        options={{ tabBarIcon: tokensIcon }}
      />
      <Tab.Screen
        name="Bookings"
        component={BookingsScreen}
        options={{ tabBarIcon: bookingsIcon }}
      />
      <Tab.Screen
        name="Patients"
        component={PatientsScreen}
        options={{ tabBarIcon: patientsIcon }}
      />
    </Tab.Navigator>
  );
}
