const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.sendShiftNotification = functions.https.onCall(async (data, context) => {
  const { userId, shiftDate, shiftRole } = data;

  const userDoc = await admin.firestore().collection('users').doc(userId).get();
  const fcmToken = userDoc.data().fcmToken;

  if (!fcmToken) {
    throw new Error('User FCM token not found');
  }

  const message = {
    token: fcmToken,
    notification: {
      title: 'New Shift Assigned',
      body: `You have a new ${shiftRole} shift on ${shiftDate}.`,
    },
  };

  await admin.messaging().send(message);
  return { success: true };
});
