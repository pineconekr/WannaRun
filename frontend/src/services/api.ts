// 담당: 설지환
// 러닝 기록 저장·조회 API 연동

export {};

const API_URL = "/api/runs";

// 러닝 기록 목록 조회
export async function getRunningRecords() {
  const response = await fetch(API_URL);

  if (!response.ok) {
    throw new Error("러닝 기록을 불러오지 못했습니다.");
  }

  return response.json();
}

// 러닝 기록 저장
export async function saveRunningRecord(record) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(record),
  });

  if (!response.ok) {
    throw new Error("러닝 기록 저장에 실패했습니다.");
  }

  return response.json();
}

// 특정 러닝 기록 조회
export async function getRunningRecord(id) {
  const response = await fetch(`${API_URL}/${id}`);

  if (!response.ok) {
    throw new Error("해당 러닝 기록을 불러오지 못했습니다.");
  }

  return response.json();
}

