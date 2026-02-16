# 드로우 에디터 가이드 (주니어 개발자용)

이 문서는 `useDrawEditor` 컴포저블을 **처음 보는 주니어 개발자**가 그대로 따라할 수 있도록 작성한 한글 API 가이드입니다.

핵심 목표는 2가지입니다.
1. 어떤 순서로 붙여야 동작하는지 이해한다.
2. 각 API를 언제/왜 써야 하는지 이해한다.

---

## 1) 이 에디터가 하는 일

`useDrawEditor`는 캔버스 기반 이미지 편집 기능을 제공합니다.

- 베이스 이미지 로드
- 체크 마크 추가 (`dot`, `circle`, `check`)
- 체크 영역 지우기
- 줌/팬 (핀치)
- 결과 이미지 최적화 (`jpeg`, `webp`, `png`)
- 다운로드/파일 변환 유틸

아키텍처 포인트:
- `HomeView`는 `canvas-wrap` 컨테이너만 렌더링
- 실제 `<canvas>` 생성/이벤트 바인딩/해제는 `useDrawEditor` 내부에서 처리

---

## 2) 파일 위치

- 컴포저블: `src/composables/useDrawEditor.ts`
- 사용 예시: `src/views/HomeView.vue`

---

## 3) 가장 빠른 시작 (복붙용)

### Template

```vue
<template>
  <div ref="canvasWrapRef" class="canvas-wrap" />
</template>
```

### Script Setup

```ts
<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useDrawEditor } from '@/composables/useDrawEditor'
import IMAGE from '@/assets/test.jpg'

const canvasWrapRef = ref<HTMLDivElement | null>(null)
const editor = ref<ReturnType<typeof useDrawEditor> | null>(null)

onMounted(async () => {
  await nextTick()

  editor.value = useDrawEditor()

  if (canvasWrapRef.value) {
    editor.value.mountCanvas(canvasWrapRef.value)
  }

  editor.value.setZoomRange(1, 4)
  await editor.value.loadBaseImage(IMAGE)
})

onUnmounted(() => {
  editor.value?.unmountCanvas()
})
</script>
```

### Style (권장)

```css
.canvas-wrap {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}
```

---

## 4) API 문서

### 4.1 상태값(Ref)

| 이름 | 타입 | 설명 |
|---|---|---|
| `mode` | `Ref<'check' \| 'erase'>` | 현재 편집 모드 |
| `shape` | `Ref<'dot' \| 'circle' \| 'check'>` | 체크 모드에서 사용할 모양 |
| `allowMulti` | `Ref<boolean>` | 다중 체크 허용 여부 |
| `markSize` | `Ref<number>` | 체크 크기 |
| `markColor` | `Ref<string>` | 체크 색상 |
| `zoomScale` | `Ref<number>` | 현재 줌 배율 |
| `minZoom` / `maxZoom` | `Ref<number>` | 최소/최대 줌 배율 |
| `panX` / `panY` | `Ref<number>` | 팬 이동값 |
| `marks` | `Ref<CheckMark[]>` | 현재 체크 데이터 |

---

### 4.2 생명주기 API

#### `mountCanvas(container: HTMLDivElement): void`
- 컨테이너 내부에 캔버스를 동적으로 생성
- 이벤트(pointer/touch 등) 등록
- 리사이즈 옵저버 등록

호출 타이밍:
- `onMounted` (DOM 준비 후)

#### `unmountCanvas(): void`
- 이벤트/타이머/옵저버/캔버스 DOM 정리
- 메모리 누수 방지

호출 타이밍:
- `onUnmounted`

---

### 4.3 이미지 흐름 API

#### `loadBaseImage(src: string): Promise<void>`
- 베이스 이미지를 로드하고 기존 마크 초기화

#### `restore(payload: { baseImageSrc: string; marks: CheckMark[] }): Promise<void>`
- 저장된 베이스 이미지 + 마크를 함께 복원

#### `renderSavedImage(savedOptimizedDataUrl: string): Promise<void>`
- 저장된 DataURL 이미지를 베이스 이미지로 다시 로드

#### `renderSavedBlob(savedBlob: Blob): Promise<void>`
- 저장된 Blob 이미지를 베이스 이미지로 다시 로드

---

### 4.4 옵션 API

#### `setMode(nextMode: 'check' | 'erase'): void`
- 체크/지우기 모드 전환

#### `setShape(nextShape: 'dot' | 'circle' | 'check'): void`
- 체크 모양 선택

#### `setAllowMulti(nextValue: boolean): void`
- `false`면 마지막 체크 1개만 유지

#### `setMarkSize(nextSize: number): void`
- 체크 크기 변경 (내부 클램프 적용)

#### `setMarkColor(nextColor: string): void`
- 체크 색상 변경

#### `setZoomRange(nextMin: number, nextMax: number): void`
- 줌 범위 설정
- 최소값은 내부에서 `1` 이상으로 고정됨

#### `setZoomScale(nextScale: number): void`
- 현재 줌 직접 설정

#### `resetZoom(): void`
- 줌/팬 초기 위치로 복귀

---

### 4.5 편집 API

#### `clearMarks(): void`
- 체크 데이터만 비우고 베이스 이미지는 유지

---

### 4.6 완료/내보내기 API

#### `complete(options?: { format?: 'jpeg' | 'webp' | 'png' })`
현재 편집 상태(베이스 + 마크)를 병합한 뒤 최적화 결과를 반환합니다.

주요 반환값:
- `optimizedAsset` (dataUrl + blob + mimeType)
- `optimizedDataUrl`
- `optimizedBlob`
- `optimizedFile`
- `optimizedMimeType`
- `optimizedFileName`
- `byteSize`
- `width`, `height`
- `baseImageSrc`, `marks`

#### `fileFromDataUrl(dataUrl, fileName?)`
- DataURL -> File 변환

#### `fileFromDataUrlAsJpeg(dataUrl, options?)`
- DataURL -> JPEG File 변환 (필요 시 리사이즈)

#### `fileFromBlobAsJpeg(sourceBlob, options?)`
- Blob -> JPEG File 변환

#### `downloadDataUrl(dataUrl, fileName?)`
- DataURL 바로 다운로드

#### `downloadFile(file)`
- File 객체 다운로드

---

## 5) 입력 이벤트 동작 방식

컴포저블이 `mountCanvas` 이후 내부적으로 이벤트를 관리합니다.

- `pointerdown`
  - 마우스/펜 입력 체크 처리
  - click 누락 이슈를 피하기 위해 사용
- `touchstart / touchmove / touchend`
  - 핀치 줌
  - 1손가락 팬(확대 상태)
  - 단일 탭 체크
단일 탭 체크는 지연 없이 즉시 처리됩니다.

---

## 6) 실제 실행 순서(프로세스)

1. 컴포넌트 마운트
2. `const editor = useDrawEditor()`
3. `editor.mountCanvas(canvasWrapEl)`
4. 옵션 설정 (`setZoomRange`, `setMarkColor` 등)
5. `await editor.loadBaseImage(...)`
6. 사용자 편집(체크/지우기/줌/팬)
7. `await editor.complete({ format: 'jpeg' })`
8. 결과 Blob/File 저장 또는 업로드
9. 컴포넌트 언마운트 시 `editor.unmountCanvas()`

---

## 7) 저장 예시 (IndexedDB/업로드)

```ts
const result = await editor.value?.complete({ format: 'jpeg' })
if (!result) return

// 1) optimizedBlob을 IndexedDB에 저장
// 2) store에는 key/id만 저장
// 3) 서버 전송 시 optimizedFile 또는 Blob 재조회 후 사용
console.log(result.optimizedFile, result.byteSize)
```

---

## 8) 자주 하는 실수와 해결법

### 8.1 체크가 안 보임
- `markColor`가 이미지와 너무 유사한지 확인
- 모드가 `check`인지 확인
- `markSize`가 너무 작은지 확인

### 8.2 캔버스가 반응 안 함
- `mountCanvas`가 DOM 준비 후 호출됐는지 확인
- 컨테이너 ref가 `null`인지 확인
- `unmountCanvas`가 너무 빨리 호출되지 않았는지 확인

### 8.3 줌했을 때 영역 밖 여백이 생김
- `canvas-wrap`에 `overflow: hidden` 적용 확인
- pan 클램프 로직이 살아있는지 확인

### 8.4 모바일 터치가 이상함
- 캔버스의 `touch-action: none` 유지
- 템플릿에서 터치 이벤트를 중복 등록하지 않기

---

## 9) 팀 개발 권장 규칙

- `onUnmounted`에서 항상 `unmountCanvas()` 호출
- 최소 줌은 `1` 이상 유지
- 서버 전송용 기본 포맷은 `jpeg` 권장
- `canvas-wrap` 비율 고정 (`16 / 9` 권장)
- IndexedDB 사용 시 store에는 key/id만 저장

---

## 10) 5분 점검 체크리스트

- `mountCanvas()`가 정확히 1회 호출되는가?
- 베이스 이미지 로드는 성공했는가?
- 현재 모드가 의도(`check`/`erase`)와 같은가?
- 체크 색상/크기가 이미지에서 식별 가능한가?
- 줌 범위(`minZoom`, `maxZoom`)가 과도하게 제한되어 있지 않은가?
- 부모 요소가 예기치 않게 영역을 잘라내고 있지 않은가?

---

## 11) 다음 확장 아이디어

- 체크 Undo/Redo 스택
- 키보드 단축키 (`R`: 지우기, `C`: 체크, `+/-`: 줌)
- 마크 데이터 버전 관리
- 내보내기 전 워터마크 옵션
- 최적화 목표 용량/품질 UI
