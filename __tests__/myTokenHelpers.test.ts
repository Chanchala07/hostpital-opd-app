import { pickCurrent, tokenView } from '../src/screens/patient/myTokenHelpers';
import { TODAY, myAppointment, myDetail } from '../test-utils/fixtures';

describe('pickCurrent', () => {
  test('prefers one already in the queue, then today, then the next one', () => {
    const later = myAppointment(1, { opdDate: '2026-11-20' });
    const today = myAppointment(2);
    const waiting = myAppointment(3, { status: 'checked_in' });
    expect(pickCurrent([later, today, waiting], TODAY)?.id).toBe(3);
    expect(pickCurrent([later, today], TODAY)?.id).toBe(2);
    expect(pickCurrent([later], TODAY)?.id).toBe(1);
  });

  test('skips cancelled and finished visits', () => {
    expect(
      pickCurrent(
        [
          myAppointment(1, { status: 'cancelled' }),
          myAppointment(2, { status: 'completed' }),
        ],
        TODAY,
      ),
    ).toBeNull();
  });
});

describe('tokenView', () => {
  test('booked today, not here yet: estimate, people ahead, check in at the desk', () => {
    const v = tokenView(myDetail(1), TODAY);
    expect(v.headline).toBe('NOT ARRIVED YET');
    expect(v.banner).toMatchObject({
      tone: 'success',
      title: 'Appointment confirmed',
      body: 'Check in at the desk when you arrive.',
    });
    expect(v).toMatchObject({
      estimatedTime: '10:50 AM',
      ahead: '2',
      position: '#2',
      canCancel: true,
      live: true,
    });
  });

  test('"Your turn is next. Please proceed to the doctor\'s cabin."', () => {
    const v = tokenView(
      myDetail(1, {
        status: 'checked_in',
        queueStatus: {
          position: 1,
          peopleAhead: 1,
          estimatedTime: '10:40',
          estimatedTimeLabel: '10:40 AM',
          upNext: true,
          inRoom: false,
          late: false,
        },
      }),
      TODAY,
    );
    expect(v.headline).toBe("YOU'RE NEXT");
    expect(v.banner.title).toBe('Your turn is next');
    expect(v.banner.body).toBe(
      "Please proceed to the doctor's cabin · Dr. Sarah Johnson · Room 103.",
    );
  });

  test('moved for being late: the new estimated time', () => {
    const v = tokenView(
      myDetail(1, {
        slotTime: '11:00',
        slotLabel: '11:00 AM',
        originalSlotTime: '10:15',
        queueStatus: {
          position: 3,
          peopleAhead: 3,
          estimatedTime: '11:05',
          estimatedTimeLabel: '11:05 AM',
          upNext: false,
          inRoom: false,
          late: false,
        },
      }),
      TODAY,
    );
    expect(v.banner).toMatchObject({
      tone: 'warning',
      title: 'Your time has moved',
      body: "You hadn't checked in by your 10:15 AM slot, so you were moved to 11:00 AM. Estimated time: 11:05 AM.",
    });
  });

  test('late and not in the line: check in at the desk to get back in', () => {
    const v = tokenView(
      myDetail(1, {
        queueStatus: {
          position: null,
          peopleAhead: null,
          estimatedTime: null,
          estimatedTimeLabel: null,
          upNext: false,
          inRoom: false,
          late: true,
        },
      }),
      TODAY,
    );
    expect(v.headline).toBe('LATE');
    expect(v.banner.title).toBe('You missed your slot');
    expect(v.ahead).toBe('—');
  });

  test('called in, pending, completed and cancelled', () => {
    expect(tokenView(myDetail(1, { status: 'called' }), TODAY)).toMatchObject({
      headline: 'PLEASE GO IN',
      estimatedTime: 'Now',
      canCancel: false,
    });
    expect(
      tokenView(
        myDetail(1, { status: 'pending', token: null, queueStatus: null }),
        TODAY,
      ).banner.title,
    ).toBe('Waiting for the clinic to confirm');
    expect(
      tokenView(myDetail(1, { status: 'completed', queueStatus: null }), TODAY),
    ).toMatchObject({ headline: 'VISIT COMPLETE', live: false });
    expect(
      tokenView(
        myDetail(1, {
          status: 'cancelled',
          statusLabel: 'Cancelled',
          queueStatus: null,
        }),
        TODAY,
      ).banner,
    ).toMatchObject({ tone: 'danger', title: 'Appointment cancelled' });
  });

  test('a later day: confirmed, not live', () => {
    const v = tokenView(myDetail(1, { opdDate: '2026-11-20' }), TODAY);
    expect(v).toMatchObject({ headline: 'CONFIRMED', live: false });
    expect(v.queueNote).toBe(
      'Your slot is 10:30 AM. Your place in the queue shows on the day.',
    );
  });
});
