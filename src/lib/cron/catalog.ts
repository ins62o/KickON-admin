export const cronMaintenanceJobs = {
  "kickon-football-provider-usage-retention": {
    label: "API 사용 기록 정리",
    target: "60일이 지난 SportsMonks 호출 기록",
  },
  "kickon-fixture-cheer-retention": {
    label: "경기 응원 메시지 정리",
    target: "48시간이 지난 경기 응원 메시지",
  },
} as const;

export type CronMaintenanceJobKey = keyof typeof cronMaintenanceJobs;

export function isCronMaintenanceJobKey(value: string): value is CronMaintenanceJobKey {
  return Object.prototype.hasOwnProperty.call(cronMaintenanceJobs, value);
}

export function getCronMaintenanceJob(value: string) {
  return isCronMaintenanceJobKey(value) ? cronMaintenanceJobs[value] : null;
}
