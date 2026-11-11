export type SafetyAction = "stop" | "pause" | "rewind" | "forward";

export type FieldType =
  | "text"
  | "textarea"
  | "counter"
  | "slider"
  | "checkbox"
  | "checkboxTrack"
  | "combo"
  | "clock";

export interface TextCard {
  id: string;
  title: string;
  body: string;
  color: "white" | "green" | "blue" | "amber" | "rose";
  createdAt: string;
  updatedAt: string;
}

export interface Scene {
  id: string;
  title: string;
  cards: TextCard[];
  createdAt: string;
  updatedAt: string;
}

export interface BaseField {
  id: string;
  label: string;
  type: FieldType;
  characterEditable: boolean;
}

export interface TextField extends BaseField {
  type: "text";
  value: string;
}

export interface TextareaField extends BaseField {
  type: "textarea";
  value: string;
}

export interface CounterField extends BaseField {
  type: "counter";
  value: number;
  min: number;
  max: number;
}

export interface SliderField extends BaseField {
  type: "slider";
  value: number;
  min: number;
  max: number;
  step: number;
}

export interface CheckboxField extends BaseField {
  type: "checkbox";
  checked: boolean;
}

export interface CheckboxTrackField extends BaseField {
  type: "checkboxTrack";
  value: number;
  boxes: number;
}

export interface ComboField extends BaseField {
  type: "combo";
  value: string;
  options: string[];
}

export interface ClockField extends BaseField {
  type: "clock";
  value: number;
  segments: number;
}

export type SheetField =
  | TextField
  | TextareaField
  | CounterField
  | SliderField
  | CheckboxField
  | CheckboxTrackField
  | ComboField
  | ClockField;

export interface SheetSection {
  id: string;
  title: string;
  collapsed: boolean;
  advancedCharacterEditing: boolean;
  fields: SheetField[];
}

export type CharacterFieldValue = string | number | boolean;

export interface CharacterTemplate {
  id: string;
  name: string;
  sections: SheetSection[];
  createdAt: string;
  updatedAt: string;
}

export interface CharacterSheet {
  id: string;
  name: string;
  templateId: string;
  values: Record<string, CharacterFieldValue>;
  sectionOverrides: Record<string, SheetSection>;
  createdAt: string;
  updatedAt: string;
}

export interface DiceResult {
  expression: string;
  total: number;
  rolls: number[];
  sides: number;
  modifier: number;
}

export interface ChatMessage {
  id: string;
  author: string;
  kind: "text" | "roll" | "safety";
  content: string;
  createdAt: string;
  roll?: DiceResult;
  safetyAction?: SafetyAction;
}

export interface SafetyList {
  lines: string[];
  veils: string[];
  highlights: string[];
}

export interface PlayerPresence {
  id: string;
  name: string;
  connectedAt: string;
}

export type RoomAccess = "open" | "restricted";

export interface RoomSummary {
  id: string;
  name: string;
  hostName: string;
  access: RoomAccess;
  allowedNames: string[];
  createdAt: string;
  playerCount: number;
}

export interface GuacamoleState {
  version: 1;
  updatedAt: string;
  activeSceneId: string;
  activeCharacterId: string;
  activeTemplateId: string;
  scenes: Scene[];
  templates: CharacterTemplate[];
  characters: CharacterSheet[];
  chat: ChatMessage[];
  safety: SafetyList;
}

export type ServerMessage =
  | { type: "state:sync"; state: GuacamoleState }
  | { type: "presence:sync"; players: PlayerPresence[] }
  | { type: "room:sync"; room: RoomSummary }
  | { type: "error"; message: string };

export type ClientMessage =
  | { type: "state:update"; state: GuacamoleState }
  | { type: "chat:create"; author: string; content: string }
  | { type: "safety:signal"; author: string; action: SafetyAction }
  | { type: "presence:update"; name: string };
