export type RunnerProfile = {
  nickname: string; birthday: string; height: string; weight: string;
  anonymous: boolean; hideSpecs: boolean;
};
export const emptyProfile: RunnerProfile = { nickname: '', birthday: '', height: '', weight: '', anonymous: false, hideSpecs: true };
const key = (id: string) => `wannarun.profile.v1.${id}`;
export function loadProfile(id: string): RunnerProfile | null {
  const raw = localStorage.getItem(key(id));
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!value || !['nickname', 'birthday', 'height', 'weight'].every(field => typeof value[field] === 'string') ||
    typeof value.anonymous !== 'boolean' || typeof value.hideSpecs !== 'boolean') throw new Error('프로필을 읽지 못했어요.');
  return value;
}
export function saveProfile(id: string, profile: RunnerProfile) {
  localStorage.setItem(key(id), JSON.stringify(profile));
}
export function profileErrors(value: RunnerProfile) {
  const errors: Partial<Record<keyof RunnerProfile, string>> = {};
  if (!value.nickname.trim() || value.nickname.trim().length > 20) errors.nickname = '닉네임을 1~20자로 입력해 주세요.';
  if (value.birthday) {
    const date = new Date(`${value.birthday}T00:00:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.birthday) || !Number.isFinite(date.getTime()) ||
      date.getFullYear() < 1900 || date > new Date() ||
      date.getMonth() + 1 !== Number(value.birthday.slice(5, 7)) || date.getDate() !== Number(value.birthday.slice(8, 10))) {
      errors.birthday = '1900년 이후의 실제 생년월일을 입력해 주세요. 미래 날짜는 사용할 수 없어요.';
    }
  }
  if (value.height && (!Number.isFinite(Number(value.height)) || Number(value.height) < 50 || Number(value.height) > 250)) errors.height = '키는 50~250cm 사이로 입력해 주세요.';
  if (value.weight && (!Number.isFinite(Number(value.weight)) || Number(value.weight) < 20 || Number(value.weight) > 400)) errors.weight = '몸무게는 20~400kg 사이로 입력해 주세요.';
  return errors;
}
