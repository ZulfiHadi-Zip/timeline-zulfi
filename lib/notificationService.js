export const requestNotificationPermission = async () => {
  if ('Notification' in window) {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
};

export const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }
};

export const sendNotification = (title, options) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, {
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          ...options,
        });
      });
    } else {
      new Notification(title, { icon: '/favicon.ico', ...options });
    }
  }
};

export const setupScheduleReminders = (todaySchedules) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = new Date();

  // 1. Morning Reminder (08:00 WIB)
  const morningTime = new Date();
  morningTime.setHours(8, 0, 0, 0);

  if (now < morningTime) {
    const timeUntilMorning = morningTime.getTime() - now.getTime();
    setTimeout(() => {
      sendNotification('Selamat Pagi Zulfi! ☀️', {
        body: `Hari ini kamu memiliki ${todaySchedules.length} sesi mengajar. Tetap semangat!`,
      });
    }, timeUntilMorning);
  }

  // 2. Class Reminder (60 Menit Sebelum Kelas)
  todaySchedules.forEach((item) => {
    if (!item.start_time) return;
    const [hours, minutes] = item.start_time.split(':');
    const classTime = new Date();
    classTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    const reminderTime = new Date(classTime.getTime() - 60 * 60 * 1000);

    if (reminderTime > now) {
      const timeUntilReminder = reminderTime.getTime() - now.getTime();
      setTimeout(() => {
        sendNotification(`Pengingat Mengajar: ${item.student_name}`, {
          body: `Kelas ${item.student_name} (${item.mode || 'Onsite'}) akan dimulai 1 jam lagi pukul ${item.start_time.slice(0, 5)}!`,
        });
      }, timeUntilReminder);
    }
  });
};