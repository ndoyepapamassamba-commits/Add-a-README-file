// AI VISUAL STUDIO — shared types. Pure data: no DOM, no network. Everything the studio stores is plain JSON.

export type MediaKind = 'image' | 'video' | 'speech' | 'music';
export type MediaCap =
  | 'IMAGE_GENERATION'
  | 'IMAGE_EDITING'
  | 'REFERENCE_IMAGES'
  | 'VIDEO_GENERATION'
  | 'IMAGE_TO_VIDEO'
  | 'FIRST_LAST_FRAME'
  | 'REFERENCE_TO_VIDEO'
  | 'AUDIO'
  | 'SPEECH'
  | 'VOICE_CLONING'
  | 'MUSIC_GENERATION';

export type ErrorClass =
  | 'AUTH_ERROR'
  | 'RATE_LIMIT'
  | 'INVALID_PARAMETER'
  | 'UNSUPPORTED_CAPABILITY'
  | 'TIMEOUT'
  | 'SERVER_ERROR'
  | 'CONTENT_ERROR'
  | 'INSUFFICIENT_CREDITS'
  | 'UNKNOWN';

export type CostMode = 'ECO' | 'BALANCED' | 'QUALITY' | 'PREMIUM' | 'AUTOPILOT';

/** Production stages of the Control Room timeline. */
export const STAGES = [
  'IDEA',
  'STORY',
  'CHARACTERS',
  'WORLD',
  'STYLE',
  'STORYBOARD',
  'IMAGES',
  'VIDEO',
  'DIALOGUE',
  'VOICE',
  'SOUND',
  'SUBTITLES',
  'EDIT',
  'QA',
  'EXPORT',
] as const;
export type Stage = (typeof STAGES)[number];
export type StageStatus =
  'QUEUED' | 'RUNNING' | 'COMPLETED' | 'WARNING' | 'FAILED' | 'NEEDS_REVIEW' | 'DISABLED';

// ───────────────────────── style / bibles ─────────────────────────

export interface StyleDNA {
  id: string;
  name: string;
  /** The default 2D style is locked: it only changes on explicit request. */
  locked: boolean;
  color: string;
  lighting: string;
  material: string;
  camera: string;
  lens: string;
  depth: string;
  contrast: string;
  texture: string;
  characterDesign: string;
  environmentDesign: string;
  animationStyle: string;
  renderStyle: string;
  postProcessing: string;
  /** Hard negatives injected in every prompt. */
  negative: string;
  /** Asset id of an image the style was derived from (optional). */
  referenceAssetId?: string;
}

export interface CharacterSheet {
  id: string;
  name: string;
  role: string;
  age: string;
  gender: string;
  ethnicity: string;
  skin: string;
  face: string;
  hair: string;
  body: string;
  height: string;
  clothing: string;
  shoes: string;
  accessories: string;
  voice: string;
  accent: string;
  personality: string;
  emotionalProfile: string;
  gestures: string;
  posture: string;
  walk: string;
  facialExpressions: string;
  speakingStyle: string;
  /** pose / variant → asset id */
  poses: Record<string, string>;
  /** Compact textual descriptor injected in prompts (consistency profile). */
  consistency: string;
  /** Asset id of the redrawn neutral pose (the style reference for every other pose). */
  referenceAssetId?: string;
  voiceProfileId?: string;
}

export interface WorldSheet {
  id: string;
  name: string;
  architecture: string;
  palette: string;
  lighting: string;
  weather: string;
  time: string;
  textures: string;
  objects: string;
  background: string;
  cameraAngles: string;
  referenceAssetIds: string[];
}

export interface VoiceProfile {
  id: string;
  characterId: string;
  language: string;
  accent: string;
  gender: string;
  age: string;
  pitch: string;
  speed: number;
  emotion: string;
  style: string;
  /** Model + voice name chosen from the discovered capabilities. Never a secret. */
  model?: string;
  voice?: string;
}

// ───────────────────────── story / scenes ─────────────────────────

export interface DialogueLine {
  speaker: string;
  text: string;
  /** Translation for subtitles when the line is in wolof. */
  translation?: string;
  language: string;
  emotion: string;
  intensity: number;
  pace: number;
  pauseAfterMs: number;
}

export interface Scene {
  scene_id: string;
  act: string;
  /** hook | escalade | twist | chute … */
  beat: string;
  duration: number;
  location: string;
  time: string;
  characters: string[];
  action: string;
  dialogue: DialogueLine[];
  emotion: string;
  camera: string;
  lighting: string;
  sound: string;
  music: string;
  transition: string;
  visual_prompt: string;
  video_prompt: string;
  voice_prompt: string;
  subtitle_prompt: string;
  /** Storyboard card state. */
  imageAssetId?: string;
  /** Generated video attached to the card; the image stays the reference. */
  videoAssetId?: string;
  status: 'DRAFT' | 'READY' | 'GENERATED' | 'APPROVED' | 'FAILED';
  quality?: number | null;
  model?: string;
}

export interface Story {
  title: string;
  logline: string;
  concept: string;
  synopsis: string;
  hook: string;
  twist: string;
  punchline: string;
  conflict: string;
  climax: string;
  resolution: string;
  durationSec: number;
  characters: string[];
  setting: string;
  theme: string;
}

// ───────────────────────── assets / jobs ─────────────────────────

export type AssetKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'music'
  | 'sfx'
  | 'character'
  | 'style'
  | 'world'
  | 'scene'
  | 'prompt';
export type AssetStatus = 'SOURCE_REFERENCE' | 'GENERATED_ASSET' | 'FINAL_ASSET';

export interface AssetMeta {
  id: string;
  kind: AssetKind;
  status: AssetStatus;
  projectId?: string;
  sceneId?: string;
  characterId?: string;
  model?: string;
  prompt?: string;
  createdAt: number;
  cost: number | null;
  quality?: number | null;
  source: string;
  tags: string[];
  mime: string;
  bytes: number;
  name: string;
  /** Mention required for anything that came from the Internet. */
  rightsNote?: string;
}

export type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export interface Job {
  id: string;
  projectId: string;
  sceneId?: string;
  kind: MediaKind;
  task: string;
  model: string;
  status: JobStatus;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  estimate: number | null;
  estimateCertain: boolean;
  cost: number | null;
  error?: string;
  errorClass?: ErrorClass;
  retries: number;
  /** Remote id + polling url of a video job (never submitted twice). */
  remoteId?: string;
  pollingUrl?: string;
  /** True once the provider accepted (and will bill) the request. */
  paid: boolean;
  assetId?: string;
  fallbackOf?: string;
  promptVersion?: string;
}

// ───────────────────────── blueprint ─────────────────────────

export interface Revision {
  at: number;
  note: string;
}
export interface CostEntry {
  at: number;
  jobId?: string;
  kind: string;
  model: string;
  amount: number;
  certain: boolean;
  note: string;
  /** LEARNING INVESTMENT: Teacher spend that improves a strategy for the future. */
  learning?: boolean;
}
export interface Decision {
  at: number;
  stage: string;
  text: string;
}
export interface QAReport {
  at: number;
  scores: {
    visual: number | null;
    narrative: number | null;
    audio: number | null;
    consistency: number | null;
    technical: number | null;
    social: number | null;
  };
  total: number | null;
  judge: string | null;
  judgeConfidence: string | null;
  issues: { code: string; severity: 'info' | 'warn' | 'error'; sceneId?: string; message: string }[];
}

export interface Blueprint {
  version: number;
  project: { id: string; createdAt: number; updatedAt: number; idea: string; status: string };
  title: string;
  language: string;
  duration: number;
  platform: string;
  aspect: string;
  mode: CostMode;
  cap: number;
  styleDNA: StyleDNA;
  story: Story | null;
  characters: CharacterSheet[];
  worlds: WorldSheet[];
  voices: VoiceProfile[];
  scenes: Scene[];
  assets: string[];
  prompts: { id: string; version: string; kind: string; text: string; model?: string; at: number }[];
  models: string[];
  generationJobs: string[];
  audio: {
    music?: { assetId?: string; spec?: unknown };
    /** Generated voice of a dialogue line, key `sceneId:index`, with its MEASURED duration. */
    voices?: Record<string, { assetId: string; seconds: number; model: string }>;
    sfx: { sceneId: string; label: string; assetId?: string }[];
  };
  subtitles: { style: string; lines: { start: number; end: number; text: string; emoji?: string }[] };
  timeline: Timeline;
  /** Social packs generated per platform. */
  social?: Record<string, import('./social').SocialPack>;
  stages: Record<string, StageStatus>;
  qa: QAReport | null;
  costs: CostEntry[];
  decisions: Decision[];
  revisions: Revision[];
}

export interface TimelineClip {
  id: string;
  track: 'video' | 'dialogue' | 'voice' | 'music' | 'sfx' | 'subtitles';
  start: number;
  duration: number;
  assetId?: string;
  sceneId?: string;
  text?: string;
  gain?: number;
  fadeIn?: number;
  fadeOut?: number;
  speed?: number;
  zoom?: number;
  transition?: string;
}
export interface Timeline {
  clips: TimelineClip[];
  aspect: string;
}

/** JEV_LOG tag of one studio job (the fields required by the spec). */
export interface StudioTag {
  project_id: string;
  scene_id?: string;
  job_id: string;
  media_type: MediaKind | 'text';
  task_family: string;
  model: string;
  champion_or_challenger: 'champion' | 'challenger' | 'none';
  prompt_version: string;
  quality: number | null;
  success: boolean;
  latency: number;
  cost: number | null;
  fallback: boolean;
  retry: number;
  correction: boolean;
  teacher: boolean;
  JEV_cost: number;
  total_cost: number | null;
}
