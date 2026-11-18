// 확장 두뇌 — 한 번 내려받으면 기기 안에서만 도는 모델들 (인터넷·키·비용·만료 없음)
//  stt : Whisper 음성인식 (녹음·영상 받아쓰기, 자막 타임코드)
//  llm : 소형 언어모델 (문장 다듬기·자연스러운 요약) — 실험 기능
import * as db from './db.js';

const TF_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
export const MODELS = {
  stt: [
    { id: 'onnx-community/whisper-base', label: '가볍게 (약 80MB)', note: '빠름, 또렷한 말에 적합' },
    { id: 'onnx-community/whisper-small', label: '정확하게 (약 250MB)', note: '회의·여러 사람 말에 추천' },
  ],
  llm: [
    { id: 'onnx-community/Qwen2.5-0.5B-Instruct', label: '소형 (약 500MB)', note: '문장 다듬기용, 실험 기능' },
  ],
};
let tf = null;
const pipes = {};
async function lib() {
  if (tf) return tf;
  tf = await import(TF_URL);
  tf.env.allowLocalModels = false;
  tf.env.useBrowserCache = true;
  return tf;
}
export const hasWebGPU = () => !!navigator.gpu;
export async function isReady(kind) { return !!(await db.kvGet('ext:' + kind, null)); }
export async function chosen(kind) { return (await db.kvGet('ext:' + kind, null)) || MODELS[kind][0].id; }

export async function load(kind, modelId, onProgress) {
  if (pipes[kind]?.id === modelId) return pipes[kind].p;
  const { pipeline } = await lib();
  const files = {};
  const progress_callback = e => {
    if (e.status === 'progress' && e.total) { files[e.file] = [e.loaded, e.total]; const [a, b] = Object.values(files).reduce((s, [x, y]) => [s[0] + x, s[1] + y], [0, 0]); onProgress && onProgress(a / b, `${Math.round(a / 1e6)}MB / ${Math.round(b / 1e6)}MB`); }
  };
  const device = hasWebGPU() ? 'webgpu' : 'wasm';
  let p;
  try {
    p = kind === 'stt'
      ? await pipeline('automatic-speech-recognition', modelId, { device, dtype: device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8', progress_callback })
      : await pipeline('text-generation', modelId, { device, dtype: 'q4f16', progress_callback });
  } catch (e) {
    // WebGPU가 안 되면 CPU(wasm)로 다시
    p = kind === 'stt' ? await pipeline('automatic-speech-recognition', modelId, { device: 'wasm', dtype: 'q8', progress_callback }) : await pipeline('text-generation', modelId, { device: 'wasm', dtype: 'q4', progress_callback });
  }
  pipes[kind] = { id: modelId, p };
  await db.kvSet('ext:' + kind, modelId);
  return p;
}
export async function remove(kind) {
  await db.kvSet('ext:' + kind, null);
  delete pipes[kind];
  try { for (const k of await caches.keys()) if (/transformers/.test(k)) await caches.delete(k); } catch { }
}

// 오디오/영상 Blob → 16kHz 모노 Float32
export async function decode(blob, { start = 0, end = null } = {}) {
  const buf = await blob.arrayBuffer();
  const ac = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  const audio = await ac.decodeAudioData(buf.slice(0));
  ac.close();
  const sr = audio.sampleRate;
  const s = Math.floor(start * sr), e = Math.min(audio.length, end ? Math.floor(end * sr) : audio.length);
  const out = new Float32Array(e - s);
  for (let c = 0; c < audio.numberOfChannels; c++) { const d = audio.getChannelData(c); for (let i = s; i < e; i++) out[i - s] += d[i] / audio.numberOfChannels; }
  if (sr === 16000) return out;
  // 다른 샘플레이트면 단순 리샘플
  const ratio = sr / 16000, n = Math.floor(out.length / ratio), r = new Float32Array(n);
  for (let i = 0; i < n; i++) r[i] = out[Math.floor(i * ratio)];
  return r;
}

export async function transcribe(blob, onProgress, range) {
  const p = await load('stt', await chosen('stt'), onProgress);
  const audio = await decode(blob, range || {});
  const r = await p(audio, { language: 'korean', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5, return_timestamps: true });
  return { text: (r.text || '').trim(), chunks: r.chunks || [] };
}

export async function polish(text, instruction = '다음 글을 자연스러운 한국어로 짧게 다듬어 주세요. 사실은 바꾸지 마세요.') {
  if (!(await isReady('llm'))) return null;
  const p = await load('llm', await chosen('llm'));
  const out = await p([{ role: 'system', content: '당신은 간결한 한국어 비서입니다.' }, { role: 'user', content: `${instruction}\n\n${text}` }], { max_new_tokens: 256, do_sample: false });
  const g = out?.[0]?.generated_text;
  return Array.isArray(g) ? g[g.length - 1]?.content : g;
}
