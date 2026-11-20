// In-app notifications (the server also sends SMS, and push once a device is
// registered). The app polls these while it is open.

import { apiRequest } from './client';

export type NotificationType =
  | 'up_next'
  | 'queue_moved'
  | 'patient_called'
  | 'booking_confirmed'
  | 'booking_declined'
  | 'appointment_booked'
  | 'booking_request'
  | 'consultation_completed'
  | 'doctor_availability'
  | (string & {});

export type AppNotification = {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
};

export const listNotifications = (unreadOnly = true) =>
  apiRequest<{ items: AppNotification[]; unreadCount: number }>(
    `/notifications?unreadOnly=${unreadOnly}&limit=20`,
  );

export const markNotificationRead = (id: number) =>
  apiRequest<null>(`/notifications/${id}/read`, { method: 'PATCH' });
