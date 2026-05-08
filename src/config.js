export const appConfig = {
  pollIntervalSeconds: 30,
  port: Number(process.env.PORT ?? 3001),
  korailHomeUrl: 'https://www.korail.com/main.html',
  korailTicketUrl: 'https://www.letskorail.com/ebizprd/EbizPrdTicketPr21111_i1.do',
  tasks: [
    {
      id: 'gwangmyeong-to-busan-2026-05-23',
      label: '5월 23일 광명 → 부산 09:00~13:00',
      date: '2026-05-23',
      from: '광명',
      to: '부산',
      startTime: '09:00',
      endTime: '13:00',
      adultCount: 1,
      seatPreference: 'ANY',
    },
    {
      id: 'busan-to-gwangmyeong-2026-05-25',
      label: '5월 25일 부산 → 광명 09:00~15:00',
      date: '2026-05-25',
      from: '부산',
      to: '광명',
      startTime: '09:00',
      endTime: '15:00',
      adultCount: 1,
      seatPreference: 'ANY',
    },
  ],
};

export const getTaskConfig = (taskId) => appConfig.tasks.find((task) => task.id === taskId);
