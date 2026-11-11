export type SafetyAction = "stop" | "pause" | "rewind" | "forward";

export const SAFETY_ACTIONS: readonly SafetyAction[] = ["stop", "pause", "rewind", "forward"];

export function safetyLabel(action: SafetyAction): string {
  switch (action) {
    case "stop":
      return "Ferramenta de segurança: parar. A cena é interrompida.";
    case "pause":
      return "Ferramenta de segurança: pausar. Façam uma pausa.";
    case "rewind":
      return "Ferramenta de segurança: retroceder. Voltem um passo na cena.";
    case "forward":
      return "Ferramenta de segurança: avançar. Pulem este trecho.";
  }
}
