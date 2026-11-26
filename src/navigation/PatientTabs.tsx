import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { Calendar, Clock, House, Pill } from 'lucide-react-native';
import PlaceholderScreen from '../components/PlaceholderScreen';
import PatientDashboardScreen from '../screens/patient/PatientDashboardScreen';
import MyPrescriptionsScreen from '../screens/patient/MyPrescriptionsScreen';
import { colors } from '../theme/colors';
import type { PatientTabParamList } from './types';

const Tab = createBottomTabNavigator<PatientTabParamList>();

type TabIconProps = { color: string; size: number };
const homeIcon = ({ color, size }: TabIconProps) => (
  <House color={color} size={size} />
);
const bookIcon = ({ color, size }: TabIconProps) => (
  <Calendar color={color} size={size} />
);
const tokenIcon = ({ color, size }: TabIconProps) => (
  <Clock color={color} size={size} />
);
const prescriptionsIcon = ({ color, size }: TabIconProps) => (
  <Pill color={color} size={size} />
);

// Never shown: the Book and My token tabs open full-screen pages instead
// (BookAppointment / TokenStatus, see `openInstead` below).
const BookScreen = () => <PlaceholderScreen title="Book a visit" />;
const MyTokenTabScreen = () => <PlaceholderScreen title="My token" />;

/** Tab listener that opens a root-stack screen instead of switching tabs. */
const openInstead =
  (screen: 'BookAppointment' | 'TokenStatus') =>
  ({
    navigation,
  }: {
    navigation: { getParent: () => NavigationProp<ParamListBase> | undefined };
  }) => ({
    tabPress: (e: { preventDefault: () => void }) => {
      e.preventDefault();
      navigation.getParent()?.navigate(screen);
    },
  });

export default function PatientTabs() {
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
        component={PatientDashboardScreen}
        options={{ tabBarIcon: homeIcon }}
      />
      <Tab.Screen
        name="Book"
        component={BookScreen}
        options={{ tabBarIcon: bookIcon }}
        listeners={openInstead('BookAppointment')}
      />
      <Tab.Screen
        name="MyToken"
        component={MyTokenTabScreen}
        options={{ tabBarIcon: tokenIcon, tabBarLabel: 'My token' }}
        listeners={openInstead('TokenStatus')}
      />
      <Tab.Screen
        name="Prescriptions"
        component={MyPrescriptionsScreen}
        options={{ tabBarIcon: prescriptionsIcon }}
      />
    </Tab.Navigator>
  );
}
