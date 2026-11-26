import React from 'react';
import { Alert } from 'react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import type { User } from '../auth/types';
import {
  NotificationsProvider,
  type OpenableNotification,
} from '../notifications/NotificationsContext';
import CreateAccountScreen from '../screens/auth/CreateAccountScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import AddPatientScreen from '../screens/common/AddPatientScreen';
import AddStaffScreen from '../screens/doctor/AddStaffScreen';
import PrescribeScreen from '../screens/doctor/PrescribeScreen';
import VisitDoneScreen from '../screens/doctor/VisitDoneScreen';
import ProfileScreen from '../screens/common/ProfileScreen';
import BookAppointmentScreen from '../screens/patient/BookAppointmentScreen';
import MyAppointmentsScreen from '../screens/patient/MyAppointmentsScreen';
import PrescriptionScreen from '../screens/patient/PrescriptionScreen';
import MyTokenScreen from '../screens/patient/MyTokenScreen';
import { comingSoon } from '../utils/format';
import AssistantTabs from './AssistantTabs';
import DoctorTabs from './DoctorTabs';
import PatientTabs from './PatientTabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** Queue news: today's token (patient), the tokens desk, the doctor's home. */
const QUEUE_TYPES = [
  'up_next',
  'queue_moved',
  'patient_called',
  'booking_confirmed',
  'appointment_booked',
  'consultation_completed',
];

/** A banner or push tapped: open the screen it is about. */
function openNotification(user: User | null, n: OpenableNotification) {
  if (!navigationRef.isReady() || !user) {
    return;
  }
  const queue = QUEUE_TYPES.includes(n.type);
  if (user.role === 'patient') {
    // Pushes carry data as strings, the server's list as numbers.
    const appointmentId = Number(n.data?.appointmentId);
    if (queue) {
      navigationRef.navigate(
        'TokenStatus',
        Number.isInteger(appointmentId) && appointmentId > 0
          ? { appointmentId }
          : undefined,
      );
    } else if (n.type === 'booking_declined') {
      navigationRef.navigate('MyAppointments');
    }
  } else if (user.role === 'assistant') {
    if (n.type === 'booking_request') {
      navigationRef.navigate('AssistantApp', { screen: 'Bookings' });
    } else if (queue) {
      navigationRef.navigate('AssistantApp', { screen: 'Tokens' });
    }
  } else if (queue || n.type === 'doctor_availability') {
    navigationRef.navigate('DoctorApp', { screen: 'Home' });
  }
}

function LoginRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Login'>) {
  const { signIn } = useAuth();
  return (
    <LoginScreen
      onSignIn={signIn}
      onForgotPassword={() => comingSoon('Forgot password')}
      onSignInWithOtp={() => comingSoon('Sign in with OTP')}
      onCreateAccount={() => navigation.navigate('CreateAccount')}
    />
  );
}

/** Once the account exists the user is signed in, so the patient app opens. */
function CreateAccountRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'CreateAccount'>) {
  const { signUp } = useAuth();
  return (
    <CreateAccountScreen
      onSubmit={signUp}
      onBack={() => navigation.goBack()}
      onSignIn={() => navigation.goBack()}
      onOpenTerms={() => comingSoon('Terms')}
      onOpenPrivacy={() => comingSoon('Privacy Policy')}
    />
  );
}

/** Patient and assistant open Profile from their home screen's avatar. */
const ProfileRoute = ({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Profile'>) => (
  <ProfileScreen onBack={() => navigation.goBack()} />
);

function AddPatientRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'AddPatient'>) {
  return (
    <AddPatientScreen
      onClose={() => navigation.goBack()}
      onSaved={({ patient, appointment, linkedExisting }) => {
        navigation.goBack();
        const doctor = appointment?.doctor;
        Alert.alert(
          'Patient added',
          [
            `${patient.fullName} · ${patient.patientCode}`,
            appointment
              ? `Token ${appointment.token?.label ?? '—'} · waiting for ${
                  doctor?.fullName ?? 'the doctor'
                }${doctor?.opdRoom ? ` (${doctor.opdRoom})` : ''}.`
              : null,
            linkedExisting
              ? 'Already registered at another clinic, so that record was linked here.'
              : null,
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }}
    />
  );
}

function AddStaffRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'AddStaff'>) {
  return (
    <AddStaffScreen
      onClose={() => navigation.goBack()}
      onSaved={({ staff, invite }, role) => {
        navigation.goBack();
        const via = invite.channels
          .map(c => (c === 'sms' ? 'SMS' : 'email'))
          .join(' and ');
        Alert.alert(
          role === 'doctor' ? 'Doctor added' : 'Assistant added',
          `${staff.fullName} will get a link by ${via} to set a password, then sign in with their mobile number.`,
        );
      }}
    />
  );
}

/**
 * Signed out → login. Signed in → the screens for the user's role.
 * Each role gets its own navigator, so screens never mix between roles.
 */
export default function RootNavigator() {
  const { user } = useAuth();

  return (
    <NavigationContainer ref={navigationRef}>
      <NotificationsProvider
        enabled={user != null}
        onOpen={n => openNotification(user, n)}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {user == null ? (
            <>
              <Stack.Screen name="Login" component={LoginRoute} />
              <Stack.Screen
                name="CreateAccount"
                component={CreateAccountRoute}
              />
            </>
          ) : (
            <>
              {user.role === 'doctor' ? (
                <>
                  <Stack.Screen name="DoctorApp" component={DoctorTabs} />
                  <Stack.Screen name="AddPatient" component={AddPatientRoute} />
                  <Stack.Screen name="AddStaff" component={AddStaffRoute} />
                  <Stack.Screen name="Prescribe" component={PrescribeScreen} />
                  <Stack.Screen name="VisitDone" component={VisitDoneScreen} />
                </>
              ) : user.role === 'assistant' ? (
                <>
                  <Stack.Screen name="AssistantApp" component={AssistantTabs} />
                  <Stack.Screen name="AddPatient" component={AddPatientRoute} />
                </>
              ) : (
                <>
                  <Stack.Screen name="PatientApp" component={PatientTabs} />
                  <Stack.Screen
                    name="BookAppointment"
                    component={BookAppointmentScreen}
                  />
                  <Stack.Screen name="TokenStatus" component={MyTokenScreen} />
                  <Stack.Screen
                    name="MyAppointments"
                    component={MyAppointmentsScreen}
                  />
                  <Stack.Screen
                    name="Prescription"
                    component={PrescriptionScreen}
                  />
                </>
              )}
              <Stack.Screen name="Profile" component={ProfileRoute} />
            </>
          )}
        </Stack.Navigator>
      </NotificationsProvider>
    </NavigationContainer>
  );
}
