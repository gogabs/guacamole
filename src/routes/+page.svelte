<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/stores";
  import { onMount, tick } from "svelte";
  import LandingPage from "$lib/components/LandingPage.svelte";
  import {
    BookOpenText,
    Check,
    Database,
    Download,
    FileText,
    MessageSquare,
    Minus,
    Pause,
    Pencil,
    Plus,
    RotateCcw,
    Send,
    Shield,
    SkipForward,
    Square,
    Trash2,
    Upload,
    UserRound,
    Wifi,
    WifiOff
  } from "lucide-svelte";
  import {
    coerceFieldValue,
    createCharacterSheet,
    createCharacterTemplate,
    createChatMessage,
    createField,
    createInitialState,
    createScene,
    createSection,
    createTextCard,
    normalizeState,
    nowIso,
    withChatMessage
  } from "$lib/shared/state";
  import type {
    CharacterFieldValue,
    CharacterSheet,
    CharacterTemplate,
    ClientMessage,
    FieldType,
    GuacamoleState,
    PlayerPresence,
    RoomAccess,
    RoomSummary,
    SafetyAction,
    SafetyList,
    Scene,
    ServerMessage,
    SheetField,
    SheetSection,
    TextCard
  } from "$lib/shared/types";

  type TabId = "scenes" | "characters" | "chat" | "safety" | "data";
  type CharacterMode = "view" | "edit" | "template";
  type SafetyColumn = keyof SafetyList;

  const tabs: Array<{ id: TabId; label: string; icon: typeof BookOpenText }> = [
    { id: "scenes", label: "Cenas", icon: BookOpenText },
    { id: "characters", label: "Fichas", icon: UserRound },
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "safety", label: "Seguranca", icon: Shield },
    { id: "data", label: "Dados", icon: Database }
  ];

  const fieldTypes: Array<{ type: FieldType; label: string }> = [
    { type: "text", label: "Linha unica" },
    { type: "textarea", label: "Multilinha" },
    { type: "counter", label: "Contador" },
    { type: "slider", label: "Slider" },
    { type: "checkbox", label: "Caixa" },
    { type: "checkboxTrack", label: "Faixa" },
    { type: "combo", label: "Combo" },
    { type: "clock", label: "Relogio" }
  ];

  const safetyColumns: Array<{ id: SafetyColumn; title: string }> = [
    { id: "lines", title: "Lines" },
    { id: "veils", title: "Veils" },
    { id: "highlights", title: "Highlights" }
  ];

  const cardColors: Array<{ color: TextCard["color"]; label: string }> = [
    { color: "white", label: "Branco" },
    { color: "green", label: "Verde" },
    { color: "blue", label: "Azul" },
    { color: "amber", label: "Ambar" },
    { color: "rose", label: "Rosa" }
  ];

  let state = createInitialState();
  let activeTab: TabId = "scenes";
  let characterMode: CharacterMode = "view";
  let actorName = "Convidado";
  let selectedFieldType: FieldType = "text";
  let editingSceneId: string | null = null;
  let isSceneListOpen = false;
  let chatDraft = "";
  let jsonDraft = "";
  let jsonDirty = false;
  let liveMessage = "";
  let livePriority: "polite" | "assertive" = "polite";
  let serverOrigin = "";
  let connectionLabel = "Desconectado";
  let connected = false;
  let connectedPlayers: PlayerPresence[] = [];
  let room: RoomSummary | null = null;
  let isHost = false;
  let showRoomSettings = false;
  let settingsName = "";
  let settingsAccess: RoomAccess = "open";
  let settingsAllowedNames = "";
  let settingsBusy = false;
  let ws: WebSocket | null = null;
  let shouldReconnect = true;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let editingCardIds = new Set<string>();
  let safetyDrafts: Record<SafetyColumn, string> = {
    lines: "",
    veils: "",
    highlights: ""
  };

  $: tableId = ($page.params.id ?? "").toUpperCase();

  $: activeScene = state.scenes.find((scene) => scene.id === state.activeSceneId) ?? state.scenes[0];
  $: activeCharacter =
    state.characters.find((character) => character.id === state.activeCharacterId) ??
      state.characters[0];
  $: activeTemplate = state.templates.find((template) => template.id === state.activeTemplateId) ??
      state.templates[0];
  $: activeCharacterTemplate = activeCharacter
    ? state.templates.find((template) => template.id === activeCharacter.templateId) ?? activeTemplate
    : activeTemplate;
  $: activeCharacterSections = activeCharacter && activeCharacterTemplate
    ? characterSections(activeCharacter, activeCharacterTemplate)
    : [];
  $: if (!jsonDirty) {
    jsonDraft = JSON.stringify(state, null, 2);
  }

  onMount(() => {
    if (!tableId) return;
    serverOrigin = resolveServerOrigin();
    actorName = localStorage.getItem("guacamole.actorName") || "Convidado";
    const localState = localStorage.getItem(localStateKey());
    if (localState) {
      try {
        state = normalizeState(JSON.parse(localState));
      } catch {
        localStorage.removeItem("guacamole.offlineState");
      }
    }

    void fetchInitialState();
    connectSocket();
    window.addEventListener("keydown", handleShortcuts);

    return () => {
      shouldReconnect = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      window.removeEventListener("keydown", handleShortcuts);
    };
  });

  function resolveServerOrigin(): string {
    const configured = import.meta.env.VITE_GUACAMOLE_SERVER as string | undefined;
    if (configured) return configured.replace(/\/$/, "");
    if (window.location.port === "8000") return window.location.origin;
    return "http://localhost:8000";
  }

  function apiUrl(path: string): string {
    return `${serverOrigin}${path}`;
  }

  function localStateKey(): string {
    return `guacamole.offlineState.${tableId}`;
  }

  async function fetchInitialState(): Promise<void> {
    try {
      const roomResponse = await fetch(apiUrl(`/api/rooms/${encodeURIComponent(tableId)}`));
      if (!roomResponse.ok) {
        window.location.replace("/");
        return;
      }
      room = await roomResponse.json() as RoomSummary;
      settingsName = room.name;
      settingsAccess = room.access;
      settingsAllowedNames = room.allowedNames.join("\n");
      isHost = Boolean(localStorage.getItem(`guacamole.hostToken.${tableId}`));
      const response = await fetch(apiUrl(`/api/state?room=${encodeURIComponent(tableId)}`));
      if (!response.ok) throw new Error("Estado indisponivel");
      acceptRemoteState(await response.json(), false);
      connectionLabel = connected ? "Conectado" : "Servidor encontrado";
    } catch {
      connectionLabel = "Modo local";
    }
  }

  function connectSocket(): void {
    if (!browser || !serverOrigin) return;
    const socketUrl = `${serverOrigin.replace(/^http/, "ws")}/ws?room=${encodeURIComponent(tableId)}&name=${encodeURIComponent(actorName)}`;
    ws = new WebSocket(socketUrl);
    connectionLabel = "Conectando";

    ws.onopen = () => {
      connected = true;
      connectionLabel = "Conectado";
      sendPresence();
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === "state:sync") {
        acceptRemoteState(message.state, true);
      } else if (message.type === "presence:sync") {
        connectedPlayers = message.players;
      } else if (message.type === "room:sync") {
        room = message.room;
      } else if (message.type === "error") {
        void announce(message.message, "assertive");
      }
    };

    ws.onclose = () => {
      connected = false;
      connectedPlayers = [];
      connectionLabel = "Desconectado";
      if (shouldReconnect) {
        reconnectTimer = setTimeout(connectSocket, 1500);
      }
    };

    ws.onerror = () => {
      connected = false;
      connectedPlayers = [];
      connectionLabel = "Erro de conexao";
    };
  }

  function acceptRemoteState(nextState: unknown, announceIncoming: boolean): void {
    const previousLastId = state.chat.at(-1)?.id;
    state = normalizeState(nextState);
    persistLocalState();
    const latest = state.chat.at(-1);
    if (announceIncoming && latest && latest.id !== previousLastId) {
      void announce(chatAnnouncement(latest), latest.kind === "safety" ? "assertive" : "polite");
    }
  }

  function commit(nextState: GuacamoleState, announcement?: string): void {
    state = normalizeState({ ...nextState, updatedAt: nowIso() });
    persistLocalState();
    sendSocket({ type: "state:update", state });
    if (announcement) void announce(announcement);
  }

  function mutate(recipe: (draft: GuacamoleState) => void, announcement?: string): void {
    const draft = structuredClone(state) as GuacamoleState;
    recipe(draft);
    commit(draft, announcement);
  }

  function sendSocket(message: ClientMessage): boolean {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  function sendPresence(): void {
    sendSocket({ type: "presence:update", name: actorName });
  }

  function persistLocalState(): void {
    if (!browser) return;
    localStorage.setItem(localStateKey(), JSON.stringify(state));
  }

  async function announce(message: string, priority: "polite" | "assertive" = "polite") {
    const doc = document as Document & {
      ariaNotify?: (message: string, options?: { priority?: "polite" | "assertive" }) => void;
    };
    if (typeof doc.ariaNotify === "function") {
      doc.ariaNotify(message, { priority });
      return;
    }
    livePriority = priority;
    liveMessage = "";
    await tick();
    liveMessage = message;
  }

  function setActorName(value: string): void {
    actorName = value;
    localStorage.setItem("guacamole.actorName", actorName);
    sendPresence();
  }

  function openRoomSettings(): void {
    if (!room || !isHost) return;
    settingsName = room.name;
    settingsAccess = room.access;
    settingsAllowedNames = room.allowedNames.join("\n");
    showRoomSettings = true;
  }

  async function saveRoomSettings(): Promise<void> {
    if (!room || !isHost || settingsBusy) return;
    settingsBusy = true;
    try {
      const response = await fetch(apiUrl(`/api/rooms/${encodeURIComponent(tableId)}`), {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-host-token": localStorage.getItem(`guacamole.hostToken.${tableId}`) || ""
        },
        body: JSON.stringify({
          name: settingsName,
          access: settingsAccess,
          allowedNames: settingsAllowedNames.split(/[\n,]/).map((name) => name.trim()).filter(Boolean)
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Não foi possível salvar as configurações.");
      room = payload as RoomSummary;
      showRoomSettings = false;
      void announce("Configurações da mesa atualizadas.");
    } catch (error) {
      void announce(error instanceof Error ? error.message : "Não foi possível salvar as configurações.", "assertive");
    } finally {
      settingsBusy = false;
    }
  }

  async function copyRoomLink(): Promise<void> {
    if (!browser) return;
    await navigator.clipboard?.writeText(window.location.href);
    void announce("Link da mesa copiado.");
  }

  function addScene(): void {
    const scene = createScene();
    mutate((draft) => {
      draft.scenes.push(scene);
      draft.activeSceneId = scene.id;
    }, "Cena adicionada.");
  }

  function selectScene(sceneId: string): void {
    editingSceneId = null;
    isSceneListOpen = false;
    mutate((draft) => {
      draft.activeSceneId = sceneId;
    });
  }

  function setSceneEditing(sceneId: string, editing: boolean): void {
    editingSceneId = editing ? sceneId : null;
    void announce(editing ? "Titulo da cena em edicao." : "Edicao do titulo concluida.");
  }

  function updateSceneTitle(sceneId: string, title: string): void {
    mutate((draft) => {
      const scene = draft.scenes.find((item) => item.id === sceneId);
      if (!scene) return;
      scene.title = title;
      scene.updatedAt = nowIso();
    });
  }

  function deleteScene(sceneId: string): void {
    if (state.scenes.length <= 1) return;
    if (editingSceneId === sceneId) editingSceneId = null;
    mutate((draft) => {
      draft.scenes = draft.scenes.filter((scene) => scene.id !== sceneId);
      if (draft.activeSceneId === sceneId) {
        draft.activeSceneId = draft.scenes[0].id;
      }
    }, "Cena removida.");
  }

  function addCard(): void {
    mutate((draft) => {
      const scene = draft.scenes.find((item) => item.id === draft.activeSceneId);
      if (!scene) return;
      scene.cards.push(createTextCard());
      scene.updatedAt = nowIso();
    }, "Card adicionado.");
  }

  function updateCard(cardId: string, patch: Partial<Pick<TextCard, "title" | "body" | "color">>): void {
    mutate((draft) => {
      const scene = draft.scenes.find((item) => item.id === draft.activeSceneId);
      const card = scene?.cards.find((item) => item.id === cardId);
      if (!scene || !card) return;
      Object.assign(card, patch, { updatedAt: nowIso() });
      scene.updatedAt = nowIso();
    });
  }

  function deleteCard(cardId: string): void {
    setCardEditing(cardId, false, false);
    mutate((draft) => {
      const scene = draft.scenes.find((item) => item.id === draft.activeSceneId);
      if (!scene) return;
      scene.cards = scene.cards.filter((card) => card.id !== cardId);
      scene.updatedAt = nowIso();
    }, "Card removido.");
  }

  function setCardEditing(cardId: string, editing: boolean, shouldAnnounce = true): void {
    const next = new Set(editingCardIds);
    if (editing) {
      next.add(cardId);
    } else {
      next.delete(cardId);
    }
    editingCardIds = next;
    if (shouldAnnounce) {
      void announce(editing ? "Card em edicao." : "Edicao do card concluida.");
    }
  }

  function addCharacter(): void {
    const template = activeTemplate ?? state.templates[0];
    const character = createCharacterSheet(template);
    mutate((draft) => {
      draft.characters.push(character);
      draft.activeCharacterId = character.id;
      draft.activeTemplateId = template.id;
    }, "Ficha adicionada.");
    characterMode = "view";
  }

  function selectCharacter(characterId: string): void {
    mutate((draft) => {
      draft.activeCharacterId = characterId;
      const character = draft.characters.find((item) => item.id === characterId);
      if (character) draft.activeTemplateId = character.templateId;
    });
    characterMode = "view";
  }

  function updateCharacterName(value: string): void {
    mutateActiveCharacter((character) => {
      character.name = value;
    });
  }

  function deleteCharacter(characterId: string): void {
    if (state.characters.length <= 1) return;
    mutate((draft) => {
      draft.characters = draft.characters.filter((character) => character.id !== characterId);
      if (draft.activeCharacterId === characterId) {
        draft.activeCharacterId = draft.characters[0].id;
        draft.activeTemplateId = draft.characters[0].templateId;
      }
    }, "Ficha removida.");
    characterMode = "view";
  }

  function addTemplate(): void {
    const template = createCharacterTemplate();
    mutate((draft) => {
      draft.templates.push(template);
      draft.activeTemplateId = template.id;
    }, "Modelo adicionado.");
    characterMode = "template";
  }

  function selectTemplate(templateId: string, openTemplate = true): void {
    mutate((draft) => {
      draft.activeTemplateId = templateId;
    });
    if (openTemplate) characterMode = "template";
  }

  function updateTemplateName(value: string): void {
    mutateActiveTemplate((template) => {
      template.name = value;
    });
  }

  function deleteTemplate(templateId: string): void {
    if (state.templates.length <= 1 || charactersUsingTemplate(templateId) > 0) return;
    mutate((draft) => {
      draft.templates = draft.templates.filter((template) => template.id !== templateId);
      if (draft.activeTemplateId === templateId) {
        draft.activeTemplateId = draft.templates[0].id;
      }
    }, "Modelo removido.");
    characterMode = "template";
  }

  function charactersUsingTemplate(templateId: string): number {
    return state.characters.filter((character) => character.templateId === templateId).length;
  }

  function startCharacterEdit(): void {
    characterMode = "edit";
    void announce("Edicao da personagem aberta.");
  }

  function finishCharacterEdit(): void {
    characterMode = "view";
    void announce("Edicao da personagem concluida.");
  }

  function startTemplateEdit(): void {
    if (!activeCharacter) return;
    selectTemplate(activeCharacter.templateId, false);
    characterMode = "template";
    void announce("Edicao do modelo aberta.");
  }

  function addSection(): void {
    mutateActiveTemplate((template) => {
      template.sections.push(createSection());
    }, "Secao adicionada.");
  }

  function updateSectionTitle(sectionId: string, title: string): void {
    mutateActiveTemplate((template) => {
      const section = template.sections.find((item) => item.id === sectionId);
      if (section) section.title = title;
    });
  }

  function setTemplateSectionOpen(templateId: string, sectionId: string, open: boolean): void {
    mutateTemplate(templateId, (template) => {
      const section = template.sections.find((item) => item.id === sectionId);
      if (section && section.collapsed === open) section.collapsed = !open;
    });
  }

  function updateSectionAdvancedEditing(sectionId: string, advancedCharacterEditing: boolean): void {
    mutateActiveTemplate((template) => {
      const section = template.sections.find((item) => item.id === sectionId);
      if (section) section.advancedCharacterEditing = advancedCharacterEditing;
    });
  }

  function deleteSection(sectionId: string): void {
    mutateActiveTemplate((template) => {
      template.sections = template.sections.filter((section) => section.id !== sectionId);
    }, "Secao removida.");
  }

  function addField(sectionId: string): void {
    mutateActiveTemplate((template) => {
      const section = template.sections.find((item) => item.id === sectionId);
      if (section) section.fields.push(createField(selectedFieldType));
    }, "Campo adicionado.");
  }

  function updateTemplateField(
    sectionId: string,
    fieldId: string,
    updater: (field: SheetField) => SheetField
  ): void {
    mutateActiveTemplate((template) => {
      const section = template.sections.find((item) => item.id === sectionId);
      if (!section) return;
      section.fields = section.fields.map((field) => field.id === fieldId ? updater(field) : field);
    });
  }

  function deleteField(sectionId: string, fieldId: string): void {
    mutateActiveTemplate((template) => {
      const section = template.sections.find((item) => item.id === sectionId);
      if (section) section.fields = section.fields.filter((field) => field.id !== fieldId);
    }, "Campo removido.");
  }

  function setCharacterSectionOpen(templateSection: SheetSection, open: boolean): void {
    if (templateSection.advancedCharacterEditing) {
      mutateCharacterSection(templateSection, (section) => {
        if (section.collapsed === open) section.collapsed = !open;
      });
      return;
    }

    if (activeCharacterTemplate) {
      setTemplateSectionOpen(activeCharacterTemplate.id, templateSection.id, open);
    }
  }

  function updateCharacterSectionTitle(templateSection: SheetSection, title: string): void {
    mutateCharacterSection(templateSection, (section) => {
      section.title = title;
    });
  }

  function addCharacterSectionField(templateSection: SheetSection): void {
    mutateCharacterSection(templateSection, (section) => {
      section.fields.push(createField(selectedFieldType));
    }, "Campo adicionado.");
  }

  function updateCharacterSectionField(
    templateSection: SheetSection,
    fieldId: string,
    updater: (field: SheetField) => SheetField
  ): void {
    mutateCharacterSection(templateSection, (section) => {
      section.fields = section.fields.map((field) => field.id === fieldId ? updater(field) : field);
    });
  }

  function deleteCharacterSectionField(templateSection: SheetSection, fieldId: string): void {
    mutateCharacterSection(templateSection, (section) => {
      section.fields = section.fields.filter((field) => field.id !== fieldId);
    }, "Campo removido.");
  }

  function updateCharacterValue(field: SheetField, value: unknown): void {
    const nextValue = coerceFieldValue(field, value);
    mutateActiveCharacter((character) => {
      character.values[field.id] = nextValue;
    });
  }

  function mutateActiveCharacter(
    recipe: (character: CharacterSheet) => void,
    announcement?: string
  ): void {
    mutate((draft) => {
      const character = draft.characters.find((item) => item.id === draft.activeCharacterId);
      if (!character) return;
      recipe(character);
      character.updatedAt = nowIso();
    }, announcement);
  }

  function mutateCharacterSection(
    templateSection: SheetSection,
    recipe: (section: SheetSection) => void,
    announcement?: string
  ): void {
    mutateActiveCharacter((character) => {
      const current = character.sectionOverrides[templateSection.id] ?? templateSection;
      const section = structuredClone(current) as SheetSection;
      section.id = templateSection.id;
      recipe(section);
      character.sectionOverrides = {
        ...character.sectionOverrides,
        [templateSection.id]: section
      };
    }, announcement);
  }

  function mutateActiveTemplate(
    recipe: (template: CharacterTemplate) => void,
    announcement?: string
  ): void {
    if (!activeTemplate) return;
    mutateTemplate(activeTemplate.id, recipe, announcement);
  }

  function mutateTemplate(
    templateId: string,
    recipe: (template: CharacterTemplate) => void,
    announcement?: string
  ): void {
    mutate((draft) => {
      const template = draft.templates.find((item) => item.id === templateId);
      if (!template) return;
      recipe(template);
      template.updatedAt = nowIso();
    }, announcement);
  }

  function setSafetyItem(column: SafetyColumn, index: number, value: string): void {
    mutate((draft) => {
      draft.safety[column][index] = value;
    });
  }

  function addSafetyItem(column: SafetyColumn): void {
    const value = safetyDrafts[column].trim();
    if (!value) return;
    mutate((draft) => {
      draft.safety[column].push(value);
    }, `${safetyColumnLabel(column)} adicionada.`);
    safetyDrafts = { ...safetyDrafts, [column]: "" };
  }

  function deleteSafetyItem(column: SafetyColumn, index: number): void {
    mutate((draft) => {
      draft.safety[column] = draft.safety[column].filter((_, itemIndex) => itemIndex !== index);
    }, `${safetyColumnLabel(column)} removida.`);
  }

  function sendChat(): void {
    const content = chatDraft.trim();
    if (!content) return;
    chatDraft = "";
    if (!sendSocket({ type: "chat:create", author: actorName, content })) {
      state = withChatMessage(state, createChatMessage(actorName, content));
      persistLocalState();
      void announce(chatAnnouncement(state.chat.at(-1)!));
    }
  }

  function sendSafetySignal(action: SafetyAction): void {
    if (!sendSocket({ type: "safety:signal", author: actorName, action })) {
      state = withChatMessage(state, createChatMessage(actorName, safetyActionLabel(action), action));
      persistLocalState();
      void announce(safetyActionLabel(action), "assertive");
    }
  }

  function handleChatKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      sendChat();
    }
  }

  function handleShortcuts(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const target = event.target as HTMLElement | null;
    const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
    if (isTyping && event.key !== "Enter") return;

    const tabByKey: Record<string, TabId> = {
      "1": "scenes",
      "2": "characters",
      "3": "chat",
      "4": "safety",
      "5": "data"
    };

    if (tabByKey[event.key]) {
      event.preventDefault();
      activeTab = tabByKey[event.key];
      void announce(`${tabLabel(activeTab)} aberta.`);
      return;
    }

    if (event.key.toLowerCase() === "n" && activeTab === "scenes") {
      event.preventDefault();
      addCard();
    }
  }

  function exportJson(): void {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `guacamole-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    void announce("JSON exportado.");
  }

  async function importFile(event: Event): Promise<void> {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      await importState(JSON.parse(await file.text()));
    } catch {
      void announce("Arquivo JSON invalido.", "assertive");
    } finally {
      (event.currentTarget as HTMLInputElement).value = "";
    }
  }

  async function applyJsonDraft(): Promise<void> {
    try {
      await importState(JSON.parse(jsonDraft));
    } catch {
      void announce("JSON invalido.", "assertive");
    }
  }

  async function importState(raw: unknown): Promise<void> {
    const imported = normalizeState(raw);
    state = { ...imported, updatedAt: nowIso() };
    jsonDirty = false;
    persistLocalState();
    try {
      const response = await fetch(apiUrl(`/api/import?room=${encodeURIComponent(tableId)}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state)
      });
      if (response.ok) {
        acceptRemoteState(await response.json(), false);
      } else {
        sendSocket({ type: "state:update", state });
      }
    } catch {
      sendSocket({ type: "state:update", state });
    }
    void announce("JSON importado.");
  }

  function inputValue(event: Event): string {
    return (event.currentTarget as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  function numberValue(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value);
  }

  function checkedValue(event: Event): boolean {
    return (event.currentTarget as HTMLInputElement).checked;
  }

  function characterSections(character: CharacterSheet, template: CharacterTemplate): SheetSection[] {
    return template.sections.map((section) =>
      section.advancedCharacterEditing && character.sectionOverrides[section.id]
        ? character.sectionOverrides[section.id]
        : section
    );
  }

  function characterFieldEditable(field: SheetField): boolean {
    return field.characterEditable !== false;
  }

  function canEditCharacterField(field: SheetField): boolean {
    return characterMode === "edit" && characterFieldEditable(field);
  }

  function characterValue(character: CharacterSheet, field: SheetField): CharacterFieldValue {
    return coerceFieldValue(field, character.values[field.id]);
  }

  function stringCharacterValue(character: CharacterSheet, field: SheetField): string {
    const value = characterValue(character, field);
    return typeof value === "string" ? value : "";
  }

  function numberCharacterValue(character: CharacterSheet, field: SheetField): number {
    const value = characterValue(character, field);
    return typeof value === "number" ? value : 0;
  }

  function booleanCharacterValue(character: CharacterSheet, field: SheetField): boolean {
    const value = characterValue(character, field);
    return typeof value === "boolean" ? value : false;
  }

  function setSteppedValue(character: CharacterSheet, field: SheetField, delta: number): void {
    updateCharacterValue(field, numberCharacterValue(character, field) + delta);
  }

  function setTrackValue(character: CharacterSheet, field: SheetField, index: number): void {
    updateCharacterValue(field, numberCharacterValue(character, field) === index + 1 ? index : index + 1);
  }

  function fieldLabelId(fieldId: string): string {
    return `field-${fieldId}-label`;
  }

  function fieldInputId(fieldId: string): string {
    return `field-${fieldId}-input`;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function cardColorClass(color: TextCard["color"]): string {
    switch (color) {
      case "green":
        return "border-avocado/40 bg-[#eef4e8]";
      case "blue":
        return "border-river/40 bg-[#eaf2f6]";
      case "amber":
        return "border-marigold/40 bg-[#fff4dc]";
      case "rose":
        return "border-tomato/40 bg-[#fff0ed]";
      case "white":
      default:
        return "border-stone-300 bg-white";
    }
  }

  function colorSwatchClass(color: TextCard["color"], selected: boolean): string {
    const base = selected ? "ring-2 ring-ink ring-offset-2" : "";
    switch (color) {
      case "green":
        return `${base} bg-[#9fbd8f]`;
      case "blue":
        return `${base} bg-[#86b4c8]`;
      case "amber":
        return `${base} bg-[#efc36d]`;
      case "rose":
        return `${base} bg-[#de8d81]`;
      case "white":
      default:
        return `${base} bg-white`;
    }
  }

  function tabLabel(tabId: TabId): string {
    return tabs.find((tab) => tab.id === tabId)?.label ?? "";
  }

  function safetyColumnLabel(column: SafetyColumn): string {
    return safetyColumns.find((item) => item.id === column)?.title ?? column;
  }

  function safetyActionLabel(action: SafetyAction): string {
    switch (action) {
      case "stop":
        return "Parar";
      case "pause":
        return "Pausar";
      case "rewind":
        return "Retroceder";
      case "forward":
        return "Avancar";
    }
  }

  function chatAnnouncement(message: NonNullable<GuacamoleState["chat"][number]>): string {
    if (message.kind === "safety" && message.safetyAction) {
      return `${message.author}: ${safetyActionLabel(message.safetyAction)}.`;
    }
    if (message.kind === "roll" && message.roll) {
      return `${message.author} rolou ${message.roll.expression}: ${message.roll.total}.`;
    }
    return `${message.author}: ${message.content.slice(0, 120)}`;
  }

  function formatTime(iso: string): string {
    return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(
      new Date(iso)
    );
  }
</script>

<svelte:head>
  <title>Guacamole</title>
</svelte:head>

<div class="min-h-screen bg-[#efede5] text-ink">
  <div class="sr-only" aria-live={livePriority} aria-atomic="true">{liveMessage}</div>

  {#if !tableId}
    <LandingPage />
  {:else}
  <div class="grid min-h-screen lg:grid-cols-[260px_1fr]">
    <header class="border-b border-stone-300 bg-paper px-4 py-4 lg:border-b-0 lg:border-r">
      <div class="flex items-center justify-between gap-3 lg:block">
        <div>
          <h1 class="text-2xl font-black tracking-normal">Guacamole</h1>
          <div class="mt-1 flex items-center gap-2 text-sm text-stone-600">
            {#if connected}
              <Wifi size={16} aria-hidden="true" />
            {:else}
              <WifiOff size={16} aria-hidden="true" />
            {/if}
            <span>{connectionLabel}</span>
        </div>
      </div>

      {#if room}
        <div class="mt-4 rounded-md border border-avocado/25 bg-avocado/10 px-3 py-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate text-sm font-bold">{room.name}</p>
              <p class="mt-1 font-mono text-xs font-bold tracking-[0.18em] text-avocado">{room.id}</p>
            </div>
            {#if isHost}
              <span class="inline-flex shrink-0 items-center rounded-full bg-avocado px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">host</span>
            {/if}
          </div>
          <div class="mt-3 flex gap-2">
            <button class="subtle-button min-w-0 flex-1 px-2 py-1.5 text-xs" type="button" on:click={copyRoomLink}>
              Compartilhar
            </button>
            {#if isHost}
              <button class="subtle-button min-w-0 flex-1 px-2 py-1.5 text-xs" type="button" on:click={openRoomSettings}>
                Gerenciar
              </button>
            {/if}
          </div>
        </div>
      {/if}
        <label class="block w-36 lg:mt-5 lg:w-full">
          <span class="sr-only">Nome na mesa</span>
          <input
            class="control w-full"
            value={actorName}
            on:input={(event) => setActorName(inputValue(event))}
            autocomplete="name"
          />
        </label>
      </div>

      <div class="mt-4 rounded-md border border-stone-300 bg-white/70 px-3 py-2">
        <div class="flex items-center justify-between gap-2 text-sm font-semibold">
          <span>Jogadores conectados</span>
          <span class="rounded-full bg-stone-200 px-2 py-0.5 text-xs">{connectedPlayers.length}</span>
        </div>
        {#if connectedPlayers.length}
          <ul class="mt-2 grid gap-1 text-sm text-stone-700">
            {#each connectedPlayers as player (player.id)}
              <li class="flex min-w-0 items-center gap-2">
                <UserRound size={15} aria-hidden="true" />
                <span class="truncate">{player.name}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="mt-2 text-sm text-stone-500">Nenhum jogador conectado</p>
        {/if}
      </div>

      <div
        class="mt-4 flex overflow-x-auto border-b border-stone-300 lg:block lg:overflow-visible lg:border-b-0 lg:border-l"
        aria-label="Guias do Guacamole"
        role="tablist"
      >
        {#each tabs as tab (tab.id)}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            class={activeTab === tab.id
              ? "flex shrink-0 items-center justify-center gap-2 border-b-2 border-ink px-3 py-2 text-sm font-semibold text-ink lg:w-full lg:justify-start lg:border-b-0 lg:border-l-4"
              : "flex shrink-0 items-center justify-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-stone-600 hover:text-ink lg:w-full lg:justify-start lg:border-b-0 lg:border-l-4"}
            on:click={() => (activeTab = tab.id)}
          >
            <svelte:component this={tab.icon} size={18} aria-hidden="true" />
            <span class="whitespace-nowrap">{tab.label}</span>
          </button>
        {/each}
      </div>
    </header>

    <main class="min-w-0 p-4 lg:p-6">
      {#if activeTab === "scenes" && activeScene}
        <section class="grid gap-4">
          <div>
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex min-w-0 flex-1 items-center gap-2">
                {#if editingSceneId === activeScene.id}
                  <label class="min-w-0 flex-1">
                    <span class="sr-only">Titulo da cena</span>
                    <input
                      class="control w-full text-lg font-bold"
                      value={activeScene.title}
                      on:input={(event) => updateSceneTitle(activeScene.id, inputValue(event))}
                    />
                  </label>
                  <button
                    class="icon-button shrink-0"
                    type="button"
                    title="Concluir edição do título"
                    on:click={() => setSceneEditing(activeScene.id, false)}
                  >
                    <Check size={17} aria-hidden="true" />
                    <span class="sr-only">Concluir edição do título</span>
                  </button>
                {:else}
                  <h2 class="min-w-0 break-words text-2xl font-black">{activeScene.title || "Cena sem titulo"}</h2>
                  <button
                    class="icon-button shrink-0"
                    type="button"
                    title="Editar título da cena"
                    on:click={() => setSceneEditing(activeScene.id, true)}
                  >
                    <Pencil size={16} aria-hidden="true" />
                    <span class="sr-only">Editar título da cena</span>
                  </button>
                {/if}
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  class="subtle-button"
                  type="button"
                  aria-expanded={isSceneListOpen}
                  aria-controls="scene-list"
                  on:click={() => (isSceneListOpen = !isSceneListOpen)}
                >
                  <BookOpenText size={17} aria-hidden="true" />
                  <span>{isSceneListOpen ? "Ocultar cenas" : "Trocar cena"}</span>
                </button>
                <button class="primary-button" type="button" on:click={addCard}>
                  <Plus size={18} aria-hidden="true" />
                  <span>Adicionar card</span>
                </button>
              </div>
            </div>

            {#if isSceneListOpen}
              <div id="scene-list" class="panel mt-3 p-3">
                <div class="flex items-center justify-between gap-2">
                  <h3 class="text-lg font-bold">Cenas</h3>
                  <button class="icon-button" type="button" title="Adicionar cena" on:click={addScene}>
                    <Plus size={18} aria-hidden="true" />
                    <span class="sr-only">Adicionar cena</span>
                  </button>
                </div>
                <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {#each state.scenes as scene (scene.id)}
                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        class={scene.id === state.activeSceneId
                          ? "min-w-0 flex-1 rounded-md bg-avocado px-3 py-2 text-left text-sm font-semibold text-white"
                          : "min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-left text-sm text-ink hover:bg-stone-50"}
                        on:click={() => selectScene(scene.id)}
                      >
                        <span class="block truncate">{scene.title}</span>
                      </button>
                      <button
                        class="icon-button"
                        type="button"
                        title="Remover cena"
                        disabled={state.scenes.length <= 1}
                        on:click={() => deleteScene(scene.id)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        <span class="sr-only">Remover cena</span>
                      </button>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <div class="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {#each activeScene.cards as card (card.id)}
                <article class={`rounded-lg border p-3 shadow-panel ${cardColorClass(card.color)}`}>
                  <div class="flex items-start gap-2">
                    {#if editingCardIds.has(card.id)}
                      <label class="min-w-0 flex-1">
                        <span class="sr-only">Titulo do card</span>
                        <input
                          class="w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-base font-bold"
                          value={card.title}
                          on:input={(event) => updateCard(card.id, { title: inputValue(event) })}
                        />
                      </label>
                    {:else}
                      <h3 class="min-w-0 flex-1 break-words px-2 py-1 text-base font-bold">
                        {card.title || "Card sem titulo"}
                      </h3>
                    {/if}
                    <button
                      class="icon-button h-8 w-8"
                      type="button"
                      title={editingCardIds.has(card.id) ? "Concluir edicao" : "Editar card"}
                      aria-pressed={editingCardIds.has(card.id)}
                      on:click={() => setCardEditing(card.id, !editingCardIds.has(card.id))}
                    >
                      {#if editingCardIds.has(card.id)}
                        <Check size={15} aria-hidden="true" />
                      {:else}
                        <Pencil size={15} aria-hidden="true" />
                      {/if}
                      <span class="sr-only">{editingCardIds.has(card.id) ? "Concluir edicao" : "Editar card"}</span>
                    </button>
                    <button
                      class="icon-button h-8 w-8"
                      type="button"
                      title="Remover card"
                      on:click={() => deleteCard(card.id)}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      <span class="sr-only">Remover card</span>
                    </button>
                  </div>
                  {#if editingCardIds.has(card.id)}
                    <label class="mt-2 block">
                      <span class="sr-only">Texto do card</span>
                      <textarea
                        class="min-h-32 w-full resize-y rounded-md border border-stone-300 bg-white/80 px-3 py-2 text-sm leading-6"
                        value={card.body}
                        on:input={(event) => updateCard(card.id, { body: inputValue(event) })}
                      ></textarea>
                    </label>
                  {:else}
                    <div class="mt-2 min-h-32 rounded-md px-2 py-2 text-sm leading-6">
                      {#if card.body.trim()}
                        <p class="whitespace-pre-wrap break-words">{card.body}</p>
                      {:else}
                        <p class="text-stone-500">Sem texto.</p>
                      {/if}
                    </div>
                  {/if}
                  {#if editingCardIds.has(card.id)}
                    <fieldset class="mt-3">
                      <legend class="sr-only">Cor do card {card.title || "sem titulo"}</legend>
                      <div class="flex gap-2">
                        {#each cardColors as item (item.color)}
                          <button
                            type="button"
                            title={item.label}
                            aria-pressed={card.color === item.color}
                            class={`h-7 w-7 rounded-md border border-stone-400 ${colorSwatchClass(item.color, card.color === item.color)}`}
                            on:click={() => updateCard(card.id, { color: item.color })}
                          >
                            <span class="sr-only">{item.label}</span>
                          </button>
                        {/each}
                      </div>
                    </fieldset>
                  {/if}
                </article>
              {/each}
            </div>
          </div>
        </section>
      {/if}

      {#if activeTab === "characters" && activeCharacter}
        <section class="grid gap-4 xl:grid-cols-[300px_1fr]">
          <aside class="space-y-4">
            <div class="panel p-3">
              <div class="flex items-center justify-between gap-2">
                <h2 class="text-lg font-bold">Personagens</h2>
                <button class="icon-button" type="button" title="Adicionar personagem" on:click={addCharacter}>
                  <Plus size={18} aria-hidden="true" />
                  <span class="sr-only">Adicionar personagem</span>
                </button>
              </div>

              <label class="mt-3 block">
                <span class="mb-1 block text-xs font-semibold uppercase text-stone-500">
                  Modelo para nova ficha
                </span>
                <select
                  class="control w-full"
                  value={state.activeTemplateId}
                  on:change={(event) => selectTemplate(inputValue(event), false)}
                >
                  {#each state.templates as template (template.id)}
                    <option value={template.id}>{template.name}</option>
                  {/each}
                </select>
              </label>

              <div class="mt-3 space-y-2">
                {#each state.characters as character (character.id)}
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class={character.id === state.activeCharacterId
                        ? "min-w-0 flex-1 rounded-md bg-avocado px-3 py-2 text-left text-sm font-semibold text-white"
                        : "min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-left text-sm text-ink hover:bg-stone-50"}
                      on:click={() => selectCharacter(character.id)}
                    >
                      <span class="block truncate">{character.name}</span>
                    </button>
                    <button
                      class="icon-button"
                      type="button"
                      title="Remover personagem"
                      disabled={state.characters.length <= 1}
                      on:click={() => deleteCharacter(character.id)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      <span class="sr-only">Remover personagem</span>
                    </button>
                  </div>
                {/each}
              </div>
            </div>

            <div class="panel p-3">
              <div class="flex items-center justify-between gap-2">
                <h2 class="text-lg font-bold">Modelos</h2>
                <button class="icon-button" type="button" title="Adicionar modelo" on:click={addTemplate}>
                  <Plus size={18} aria-hidden="true" />
                  <span class="sr-only">Adicionar modelo</span>
                </button>
              </div>
              <div class="mt-3 space-y-2">
                {#each state.templates as template (template.id)}
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class={template.id === state.activeTemplateId && characterMode === "template"
                        ? "min-w-0 flex-1 rounded-md bg-river px-3 py-2 text-left text-sm font-semibold text-white"
                        : "min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-left text-sm text-ink hover:bg-stone-50"}
                      on:click={() => selectTemplate(template.id)}
                    >
                      <span class="block truncate">{template.name}</span>
                      <span class="mt-1 block text-xs opacity-80">
                        {charactersUsingTemplate(template.id)} personagens
                      </span>
                    </button>
                    <button
                      class="icon-button"
                      type="button"
                      title="Remover modelo"
                      disabled={state.templates.length <= 1 || charactersUsingTemplate(template.id) > 0}
                      on:click={() => deleteTemplate(template.id)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      <span class="sr-only">Remover modelo</span>
                    </button>
                  </div>
                {/each}
              </div>
            </div>
          </aside>

          <div class="space-y-4">
            {#if characterMode === "template" && activeTemplate}
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label class="min-w-0 flex-1">
                  <span class="sr-only">Nome do modelo</span>
                  <input
                    class="control w-full text-lg font-bold"
                    value={activeTemplate.name}
                    on:input={(event) => updateTemplateName(inputValue(event))}
                  />
                </label>
                <div class="flex flex-wrap gap-2">
                  <button class="primary-button" type="button" on:click={addCharacter}>
                    <Plus size={18} aria-hidden="true" />
                    <span>Personagem</span>
                  </button>
                  <button class="subtle-button" type="button" on:click={() => (characterMode = "view")}>
                    <Check size={18} aria-hidden="true" />
                    <span>Concluir modelo</span>
                  </button>
                </div>
              </div>

              {#each activeTemplate.sections as section (section.id)}
                <details
                  class="panel overflow-hidden"
                  open={!section.collapsed}
                  on:toggle={(event) =>
                    setTemplateSectionOpen(activeTemplate.id, section.id, (event.currentTarget as HTMLDetailsElement).open)}
                >
                  <summary class="cursor-pointer border-b border-stone-300 bg-white px-3 py-3">
                    <div class="flex flex-col gap-2 md:flex-row md:items-center">
                      <label class="min-w-0 flex-1">
                        <span class="sr-only">Titulo da secao</span>
                        <input
                          class="w-full rounded-md border border-stone-300 bg-white px-2 py-1 font-bold"
                          value={section.title}
                          on:click|stopPropagation
                          on:input={(event) => updateSectionTitle(section.id, inputValue(event))}
                        />
                      </label>
                      <label class="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          class="h-4 w-4 rounded border-stone-400 text-avocado"
                          checked={section.advancedCharacterEditing}
                          on:click|stopPropagation
                          on:change={(event) => updateSectionAdvancedEditing(section.id, checkedValue(event))}
                        />
                        <span>Edição avançada na personagem</span>
                      </label>
                      <div class="flex gap-2">
                        <select
                          class="control"
                          bind:value={selectedFieldType}
                          aria-label="Tipo de campo"
                          on:click|stopPropagation
                        >
                          {#each fieldTypes as item (item.type)}
                            <option value={item.type}>{item.label}</option>
                          {/each}
                        </select>
                        <button
                          class="icon-button"
                          type="button"
                          title="Adicionar campo"
                          on:click={(event) => {
                            event.stopPropagation();
                            addField(section.id);
                          }}
                        >
                          <Plus size={18} aria-hidden="true" />
                          <span class="sr-only">Adicionar campo</span>
                        </button>
                        <button
                          class="icon-button"
                          type="button"
                          title="Remover secao"
                          disabled={activeTemplate.sections.length <= 1}
                          on:click={(event) => {
                            event.stopPropagation();
                            deleteSection(section.id);
                          }}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                          <span class="sr-only">Remover secao</span>
                        </button>
                      </div>
                    </div>
                  </summary>

                  <div class="grid gap-3 p-3 lg:grid-cols-2">
                      {#each section.fields as field (field.id)}
                        <div class="rounded-lg border border-stone-300 bg-white p-3">
                          <div class="mb-3 flex items-start gap-2">
                            <label class="min-w-0 flex-1">
                              <span class="sr-only">Rotulo do campo</span>
                              <input
                                class="w-full rounded-md border border-stone-300 px-2 py-1 text-sm font-semibold"
                                value={field.label}
                                on:input={(event) =>
                                  updateTemplateField(section.id, field.id, (current) => ({
                                    ...current,
                                    label: inputValue(event)
                                  }))}
                              />
                            </label>
                            <button
                              class="icon-button h-8 w-8"
                              type="button"
                              title="Remover campo"
                              on:click={() => deleteField(section.id, field.id)}
                            >
                              <Trash2 size={15} aria-hidden="true" />
                              <span class="sr-only">Remover campo</span>
                            </button>
                          </div>

                          <label class="mb-3 inline-flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              class="h-4 w-4 rounded border-stone-400 text-avocado"
                              checked={characterFieldEditable(field)}
                              on:change={(event) =>
                                updateTemplateField(section.id, field.id, (current) => ({
                                  ...current,
                                  characterEditable: checkedValue(event)
                                }))}
                            />
                            <span>Editável na personagem</span>
                          </label>

                          {#if field.type === "counter"}
                            <div class="grid gap-2 sm:grid-cols-2">
                              <label class="grid gap-1 text-sm">
                                <span>Minimo</span>
                                <input
                                  class="control w-full"
                                  type="number"
                                  value={field.min}
                                  on:input={(event) =>
                                    updateTemplateField(section.id, field.id, (current) =>
                                      current.type === "counter"
                                        ? { ...current, min: numberValue(event) }
                                        : current)}
                                />
                              </label>
                              <label class="grid gap-1 text-sm">
                                <span>Maximo</span>
                                <input
                                  class="control w-full"
                                  type="number"
                                  value={field.max}
                                  on:input={(event) =>
                                    updateTemplateField(section.id, field.id, (current) =>
                                      current.type === "counter"
                                        ? { ...current, max: numberValue(event) }
                                        : current)}
                                />
                              </label>
                            </div>
                          {:else if field.type === "slider"}
                            <div class="grid gap-2 sm:grid-cols-3">
                              <label class="grid gap-1 text-sm">
                                <span>Minimo</span>
                                <input
                                  class="control w-full"
                                  type="number"
                                  value={field.min}
                                  on:input={(event) =>
                                    updateTemplateField(section.id, field.id, (current) =>
                                      current.type === "slider"
                                        ? { ...current, min: numberValue(event) }
                                        : current)}
                                />
                              </label>
                              <label class="grid gap-1 text-sm">
                                <span>Maximo</span>
                                <input
                                  class="control w-full"
                                  type="number"
                                  value={field.max}
                                  on:input={(event) =>
                                    updateTemplateField(section.id, field.id, (current) =>
                                      current.type === "slider"
                                        ? { ...current, max: numberValue(event) }
                                        : current)}
                                />
                              </label>
                              <label class="grid gap-1 text-sm">
                                <span>Passo</span>
                                <input
                                  class="control w-full"
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={field.step}
                                  on:input={(event) =>
                                    updateTemplateField(section.id, field.id, (current) =>
                                      current.type === "slider"
                                        ? { ...current, step: numberValue(event) }
                                        : current)}
                                />
                              </label>
                            </div>
                          {:else if field.type === "checkboxTrack"}
                            <label class="grid max-w-40 gap-1 text-sm">
                              <span>Caixas</span>
                              <input
                                class="control w-full"
                                type="number"
                                min="1"
                                value={field.boxes}
                                on:input={(event) =>
                                  updateTemplateField(section.id, field.id, (current) =>
                                    current.type === "checkboxTrack"
                                      ? { ...current, boxes: Math.max(1, Math.round(numberValue(event))) }
                                      : current)}
                              />
                            </label>
                          {:else if field.type === "clock"}
                            <label class="grid max-w-40 gap-1 text-sm">
                              <span>Segmentos</span>
                              <input
                                class="control w-full"
                                type="number"
                                min="2"
                                value={field.segments}
                                on:input={(event) =>
                                  updateTemplateField(section.id, field.id, (current) =>
                                    current.type === "clock"
                                      ? { ...current, segments: Math.max(2, Math.round(numberValue(event))) }
                                      : current)}
                              />
                            </label>
                          {:else if field.type === "combo"}
                            <label class="grid gap-1 text-sm">
                              <span>Opcoes</span>
                              <input
                                class="control w-full"
                                value={field.options.join(", ")}
                                on:change={(event) =>
                                  updateTemplateField(section.id, field.id, (current) => {
                                    if (current.type !== "combo") return current;
                                    const options = inputValue(event)
                                      .split(",")
                                      .map((option) => option.trim())
                                      .filter(Boolean);
                                    return {
                                      ...current,
                                      options: options.length ? options : current.options,
                                      value: options.includes(current.value)
                                        ? current.value
                                        : options[0] ?? current.value
                                    };
                                  })}
                              />
                            </label>
                          {:else}
                            <p class="text-sm text-stone-600">Sem configuracao adicional.</p>
                          {/if}
                        </div>
                      {/each}
                  </div>
                </details>
              {/each}

              <button class="subtle-button" type="button" on:click={addSection}>
                <Plus size={18} aria-hidden="true" />
                <span>Secao</span>
              </button>
            {:else if activeCharacterTemplate}
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0 flex-1">
                  {#if characterMode === "edit"}
                    <label class="block">
                      <span class="sr-only">Nome da personagem</span>
                      <input
                        class="control w-full text-lg font-bold"
                        value={activeCharacter.name}
                        on:input={(event) => updateCharacterName(inputValue(event))}
                      />
                    </label>
                  {:else}
                    <h2 class="break-words text-lg font-bold">{activeCharacter.name}</h2>
                  {/if}
                  <p class="mt-1 text-sm text-stone-600">Modelo: {activeCharacterTemplate.name}</p>
                </div>

                <div class="flex flex-wrap gap-2">
                  {#if characterMode === "view"}
                    <button class="primary-button" type="button" on:click={startCharacterEdit}>
                      <Pencil size={18} aria-hidden="true" />
                      <span>Editar personagem</span>
                    </button>
                  {:else}
                    <button class="subtle-button" type="button" on:click={startTemplateEdit}>
                      <Pencil size={18} aria-hidden="true" />
                      <span>Editar modelo</span>
                    </button>
                    <button class="primary-button" type="button" on:click={finishCharacterEdit}>
                      <Check size={18} aria-hidden="true" />
                      <span>Concluir</span>
                    </button>
                  {/if}
                </div>
              </div>

              {#each activeCharacterSections as section (section.id)}
                <details
                  class="panel overflow-hidden"
                  open={!section.collapsed}
                  on:toggle={(event) => setCharacterSectionOpen(section, (event.currentTarget as HTMLDetailsElement).open)}
                >
                  <summary class="cursor-pointer border-b border-stone-300 bg-white px-3 py-3">
                    {#if characterMode === "edit" && section.advancedCharacterEditing}
                      <div class="flex flex-col gap-2 md:flex-row md:items-center">
                        <label class="min-w-0 flex-1">
                          <span class="sr-only">Titulo da secao</span>
                          <input
                            class="w-full rounded-md border border-stone-300 bg-white px-2 py-1 font-bold"
                            value={section.title}
                            on:click|stopPropagation
                            on:input={(event) => updateCharacterSectionTitle(section, inputValue(event))}
                          />
                        </label>
                        <div class="flex gap-2">
                          <select
                            class="control"
                            bind:value={selectedFieldType}
                            aria-label="Tipo de campo"
                            on:click|stopPropagation
                          >
                            {#each fieldTypes as item (item.type)}
                              <option value={item.type}>{item.label}</option>
                            {/each}
                          </select>
                          <button
                            class="icon-button"
                            type="button"
                            title="Adicionar campo"
                            on:click={(event) => {
                              event.stopPropagation();
                              addCharacterSectionField(section);
                            }}
                          >
                            <Plus size={18} aria-hidden="true" />
                            <span class="sr-only">Adicionar campo</span>
                          </button>
                        </div>
                      </div>
                    {:else}
                      <span class="block min-w-0 break-words px-2 py-1 font-bold">{section.title}</span>
                    {/if}
                  </summary>

                  {#if characterMode === "edit" && section.advancedCharacterEditing}
                    <div class="grid gap-3 p-3 lg:grid-cols-2">
                      {#each section.fields as field (field.id)}
                        <div class="rounded-lg border border-stone-300 bg-white p-3">
                          <div class="mb-3 flex items-start gap-2">
                            <label class="min-w-0 flex-1">
                              <span class="sr-only">Rotulo do campo</span>
                              <input
                                class="w-full rounded-md border border-stone-300 px-2 py-1 text-sm font-semibold"
                                value={field.label}
                                on:input={(event) =>
                                  updateCharacterSectionField(section, field.id, (current) => ({
                                    ...current,
                                    label: inputValue(event)
                                  }))}
                              />
                            </label>
                            <button
                              class="icon-button h-8 w-8"
                              type="button"
                              title="Remover campo"
                              on:click={() => deleteCharacterSectionField(section, field.id)}
                            >
                              <Trash2 size={15} aria-hidden="true" />
                              <span class="sr-only">Remover campo</span>
                            </button>
                          </div>

                          <label class="mb-3 inline-flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              class="h-4 w-4 rounded border-stone-400 text-avocado"
                              checked={characterFieldEditable(field)}
                              on:change={(event) =>
                                updateCharacterSectionField(section, field.id, (current) => ({
                                  ...current,
                                  characterEditable: checkedValue(event)
                                }))}
                            />
                            <span>Editável na personagem</span>
                          </label>

                          {#if field.type === "counter"}
                            <div class="grid gap-2 sm:grid-cols-2">
                              <label class="grid gap-1 text-sm">
                                <span>Minimo</span>
                                <input
                                  class="control w-full"
                                  type="number"
                                  value={field.min}
                                  on:input={(event) =>
                                    updateCharacterSectionField(section, field.id, (current) =>
                                      current.type === "counter"
                                        ? { ...current, min: numberValue(event) }
                                        : current)}
                                />
                              </label>
                              <label class="grid gap-1 text-sm">
                                <span>Maximo</span>
                                <input
                                  class="control w-full"
                                  type="number"
                                  value={field.max}
                                  on:input={(event) =>
                                    updateCharacterSectionField(section, field.id, (current) =>
                                      current.type === "counter"
                                        ? { ...current, max: numberValue(event) }
                                        : current)}
                                />
                              </label>
                            </div>
                          {:else if field.type === "slider"}
                            <div class="grid gap-2 sm:grid-cols-3">
                              <label class="grid gap-1 text-sm">
                                <span>Minimo</span>
                                <input
                                  class="control w-full"
                                  type="number"
                                  value={field.min}
                                  on:input={(event) =>
                                    updateCharacterSectionField(section, field.id, (current) =>
                                      current.type === "slider"
                                        ? { ...current, min: numberValue(event) }
                                        : current)}
                                />
                              </label>
                              <label class="grid gap-1 text-sm">
                                <span>Maximo</span>
                                <input
                                  class="control w-full"
                                  type="number"
                                  value={field.max}
                                  on:input={(event) =>
                                    updateCharacterSectionField(section, field.id, (current) =>
                                      current.type === "slider"
                                        ? { ...current, max: numberValue(event) }
                                        : current)}
                                />
                              </label>
                              <label class="grid gap-1 text-sm">
                                <span>Passo</span>
                                <input
                                  class="control w-full"
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={field.step}
                                  on:input={(event) =>
                                    updateCharacterSectionField(section, field.id, (current) =>
                                      current.type === "slider"
                                        ? { ...current, step: numberValue(event) }
                                        : current)}
                                />
                              </label>
                            </div>
                          {:else if field.type === "checkboxTrack"}
                            <label class="grid max-w-40 gap-1 text-sm">
                              <span>Caixas</span>
                              <input
                                class="control w-full"
                                type="number"
                                min="1"
                                value={field.boxes}
                                on:input={(event) =>
                                  updateCharacterSectionField(section, field.id, (current) =>
                                    current.type === "checkboxTrack"
                                      ? { ...current, boxes: Math.max(1, Math.round(numberValue(event))) }
                                      : current)}
                              />
                            </label>
                          {:else if field.type === "clock"}
                            <label class="grid max-w-40 gap-1 text-sm">
                              <span>Segmentos</span>
                              <input
                                class="control w-full"
                                type="number"
                                min="2"
                                value={field.segments}
                                on:input={(event) =>
                                  updateCharacterSectionField(section, field.id, (current) =>
                                    current.type === "clock"
                                      ? { ...current, segments: Math.max(2, Math.round(numberValue(event))) }
                                      : current)}
                              />
                            </label>
                          {:else if field.type === "combo"}
                            <label class="grid gap-1 text-sm">
                              <span>Opcoes</span>
                              <input
                                class="control w-full"
                                value={field.options.join(", ")}
                                on:change={(event) =>
                                  updateCharacterSectionField(section, field.id, (current) => {
                                    if (current.type !== "combo") return current;
                                    const options = inputValue(event)
                                      .split(",")
                                      .map((option) => option.trim())
                                      .filter(Boolean);
                                    return {
                                      ...current,
                                      options: options.length ? options : current.options,
                                      value: options.includes(current.value)
                                        ? current.value
                                        : options[0] ?? current.value
                                    };
                                  })}
                              />
                            </label>
                          {:else}
                            <p class="text-sm text-stone-600">Sem configuracao adicional.</p>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <div class="grid gap-3 p-3 lg:grid-cols-2">
                      {#each section.fields as field (field.id)}
                        <div class="rounded-lg border border-stone-300 bg-white p-3">
                          <span id={fieldLabelId(field.id)} class="mb-2 block break-words text-sm font-semibold">
                            {field.label}
                          </span>

                          {#if field.type === "text"}
                            {#if canEditCharacterField(field)}
                              <input
                                class="control w-full"
                                id={fieldInputId(field.id)}
                                aria-labelledby={fieldLabelId(field.id)}
                                value={stringCharacterValue(activeCharacter, field)}
                                on:input={(event) => updateCharacterValue(field, inputValue(event))}
                              />
                            {:else}
                              <p class="min-h-10 whitespace-pre-wrap break-words rounded-md bg-stone-50 px-3 py-2 text-sm">
                                {stringCharacterValue(activeCharacter, field) || "Sem valor."}
                              </p>
                            {/if}
                          {:else if field.type === "textarea"}
                            {#if canEditCharacterField(field)}
                              <textarea
                                class="control min-h-28 w-full resize-y"
                                id={fieldInputId(field.id)}
                                aria-labelledby={fieldLabelId(field.id)}
                                value={stringCharacterValue(activeCharacter, field)}
                                on:input={(event) => updateCharacterValue(field, inputValue(event))}
                              ></textarea>
                            {:else}
                              <p class="min-h-24 whitespace-pre-wrap break-words rounded-md bg-stone-50 px-3 py-2 text-sm leading-6">
                                {stringCharacterValue(activeCharacter, field) || "Sem valor."}
                              </p>
                            {/if}
                          {:else if field.type === "counter"}
                            <div class="flex items-center gap-2">
                              <button
                                class="icon-button"
                                type="button"
                                title="Diminuir"
                                disabled={characterMode === "edit" && !characterFieldEditable(field)}
                                on:click={() => setSteppedValue(activeCharacter, field, -1)}
                              >
                                <Minus size={16} aria-hidden="true" />
                                <span class="sr-only">Diminuir {field.label}</span>
                              </button>
                              <input
                                class="control w-24 text-center"
                                id={fieldInputId(field.id)}
                                aria-labelledby={fieldLabelId(field.id)}
                                type="number"
                                value={numberCharacterValue(activeCharacter, field)}
                                min={field.min}
                                max={field.max}
                                disabled={characterMode === "edit" && !characterFieldEditable(field)}
                                on:input={(event) => updateCharacterValue(field, numberValue(event))}
                              />
                              <button
                                class="icon-button"
                                type="button"
                                title="Aumentar"
                                disabled={characterMode === "edit" && !characterFieldEditable(field)}
                                on:click={() => setSteppedValue(activeCharacter, field, 1)}
                              >
                                <Plus size={16} aria-hidden="true" />
                                <span class="sr-only">Aumentar {field.label}</span>
                              </button>
                              <span class="text-sm text-stone-600">/ {field.max}</span>
                            </div>
                          {:else if field.type === "slider"}
                            <div class="grid gap-2">
                              <input
                                id={fieldInputId(field.id)}
                                aria-labelledby={fieldLabelId(field.id)}
                                type="range"
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                value={numberCharacterValue(activeCharacter, field)}
                                disabled={characterMode === "edit" && !characterFieldEditable(field)}
                                on:input={(event) => updateCharacterValue(field, numberValue(event))}
                              />
                              <div
                                class="flex items-center justify-between text-sm text-stone-600"
                                role="presentation"
                                aria-hidden="true"
                              >
                                <span>{field.min}</span>
                                <strong class="font-semibold text-ink">
                                  {numberCharacterValue(activeCharacter, field)}
                                </strong>
                                <span>{field.max}</span>
                              </div>
                            </div>
                          {:else if field.type === "checkbox"}
                            <label class="inline-flex items-center gap-2 text-sm">
                              <input
                                id={fieldInputId(field.id)}
                                aria-labelledby={fieldLabelId(field.id)}
                                type="checkbox"
                                class="h-5 w-5 rounded border-stone-400 text-avocado"
                                checked={booleanCharacterValue(activeCharacter, field)}
                                disabled={characterMode === "edit" && !characterFieldEditable(field)}
                                on:change={(event) => updateCharacterValue(field, checkedValue(event))}
                              />
                              <span>{booleanCharacterValue(activeCharacter, field) ? "Marcado" : "Desmarcado"}</span>
                            </label>
                          {:else if field.type === "checkboxTrack"}
                            <fieldset aria-labelledby={fieldLabelId(field.id)}>
                              <div class="flex flex-wrap gap-2">
                                {#each Array.from({ length: field.boxes }) as _, index}
                                  <label class="block cursor-pointer">
                                    <input
                                      class="sr-only"
                                      type="checkbox"
                                      checked={index < numberCharacterValue(activeCharacter, field)}
                                      disabled={characterMode === "edit" && !characterFieldEditable(field)}
                                      on:change={() => setTrackValue(activeCharacter, field, index)}
                                    />
                                    <span
                                      aria-hidden="true"
                                      class={index < numberCharacterValue(activeCharacter, field)
                                        ? "block h-9 w-9 rounded-md border border-avocado bg-avocado"
                                        : "block h-9 w-9 rounded-md border border-stone-400 bg-white"}
                                    ></span>
                                    <span class="sr-only">Caixa {index + 1} de {field.boxes}</span>
                                  </label>
                                {/each}
                              </div>
                            </fieldset>
                          {:else if field.type === "combo"}
                            {#if canEditCharacterField(field)}
                              <select
                                class="control w-full"
                                id={fieldInputId(field.id)}
                                aria-labelledby={fieldLabelId(field.id)}
                                value={stringCharacterValue(activeCharacter, field)}
                                on:change={(event) => updateCharacterValue(field, inputValue(event))}
                              >
                                {#each field.options as option}
                                  <option value={option}>{option}</option>
                                {/each}
                              </select>
                            {:else}
                              <p class="rounded-md bg-stone-50 px-3 py-2 text-sm">
                                {stringCharacterValue(activeCharacter, field)}
                              </p>
                            {/if}
                          {:else if field.type === "clock"}
                            <div class="flex flex-wrap gap-2" role="group" aria-labelledby={fieldLabelId(field.id)}>
                              {#each Array.from({ length: field.segments }) as _, index}
                                <button
                                  type="button"
                                  aria-pressed={index < numberCharacterValue(activeCharacter, field)}
                                  class={index < numberCharacterValue(activeCharacter, field)
                                    ? "h-9 w-9 rounded-full border border-river bg-river text-white"
                                    : "h-9 w-9 rounded-full border border-stone-400 bg-white text-stone-500"}
                                  disabled={characterMode === "edit" && !characterFieldEditable(field)}
                                  on:click={() => setTrackValue(activeCharacter, field, index)}
                                >
                                  <span class="sr-only">Segmento {index + 1} de {field.segments}</span>
                                </button>
                              {/each}
                            </div>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {/if}
                </details>
              {/each}
            {/if}
          </div>
        </section>
      {/if}

      {#if activeTab === "chat"}
        <section class="grid min-h-[calc(100vh-3rem)] gap-4 xl:grid-cols-[1fr_280px]">
          <div class="panel flex min-h-[560px] flex-col">
            <div class="flex flex-wrap items-center gap-2 border-b border-stone-300 bg-white px-3 py-3">
              <button class="danger-button" type="button" on:click={() => sendSafetySignal("stop")}>
                <Square size={16} aria-hidden="true" />
                <span>Parar</span>
              </button>
              <button class="subtle-button" type="button" on:click={() => sendSafetySignal("pause")}>
                <Pause size={16} aria-hidden="true" />
                <span>Pausar</span>
              </button>
              <button class="subtle-button" type="button" on:click={() => sendSafetySignal("rewind")}>
                <RotateCcw size={16} aria-hidden="true" />
                <span>Retroceder</span>
              </button>
              <button class="subtle-button" type="button" on:click={() => sendSafetySignal("forward")}>
                <SkipForward size={16} aria-hidden="true" />
                <span>Avancar</span>
              </button>
            </div>

            <div class="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
              {#each state.chat as message (message.id)}
                <article
                  class={message.kind === "safety"
                    ? "rounded-lg border border-tomato/40 bg-[#fff0ed] p-3"
                    : message.kind === "roll"
                      ? "rounded-lg border border-river/40 bg-[#eaf2f6] p-3"
                      : "rounded-lg border border-stone-300 bg-white p-3"}
                >
                  <div class="flex flex-wrap items-center gap-2 text-sm">
                    <strong>{message.author}</strong>
                    <span class="text-stone-500">{formatTime(message.createdAt)}</span>
                  </div>
                  <p class="mt-1 whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                  {#if message.roll}
                    <div class="mt-2 rounded-md border border-river/30 bg-white/70 px-3 py-2 text-sm">
                      <strong>{message.roll.expression}: {message.roll.total}</strong>
                      <span class="ml-2 text-stone-600">[{message.roll.rolls.join(", ")}]</span>
                    </div>
                  {/if}
                </article>
              {/each}
            </div>

            <div class="border-t border-stone-300 bg-white p-3">
              <div class="flex gap-2">
                <label class="min-w-0 flex-1">
                  <span class="sr-only">Mensagem de chat</span>
                  <textarea
                    class="control min-h-16 w-full resize-y"
                    value={chatDraft}
                    on:input={(event) => (chatDraft = inputValue(event))}
                    on:keydown={handleChatKeydown}
                    placeholder="Mensagem"
                  ></textarea>
                </label>
                <button class="primary-button self-end" type="button" on:click={sendChat}>
                  <Send size={18} aria-hidden="true" />
                  <span>Enviar</span>
                </button>
              </div>
            </div>
          </div>

          <aside class="panel p-3">
            <h2 class="text-lg font-bold">Dados recentes</h2>
            <div class="mt-3 space-y-2">
              {#each state.chat.filter((message) => message.roll).slice(-6).reverse() as message (message.id)}
                <div class="rounded-md border border-river/30 bg-white px-3 py-2 text-sm">
                  <div class="font-semibold">{message.roll?.expression}: {message.roll?.total}</div>
                  <div class="text-stone-600">{message.author}</div>
                </div>
              {/each}
            </div>
          </aside>
        </section>
      {/if}

      {#if activeTab === "safety"}
        <section class="grid gap-4 lg:grid-cols-3">
          {#each safetyColumns as column (column.id)}
            <div class="panel p-3">
              <h2 class="text-lg font-bold">{column.title}</h2>
              <div class="mt-3 space-y-2">
                {#each state.safety[column.id] as item, index}
                  <div class="flex items-start gap-2">
                    <textarea
                      class="control min-h-14 flex-1 resize-y"
                      value={item}
                      on:input={(event) => setSafetyItem(column.id, index, inputValue(event))}
                    ></textarea>
                    <button
                      class="icon-button"
                      type="button"
                      title="Remover item"
                      on:click={() => deleteSafetyItem(column.id, index)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      <span class="sr-only">Remover item</span>
                    </button>
                  </div>
                {/each}
              </div>
              <div class="mt-3 flex gap-2">
                <input
                  class="control min-w-0 flex-1"
                  value={safetyDrafts[column.id]}
                  on:input={(event) =>
                    (safetyDrafts = { ...safetyDrafts, [column.id]: inputValue(event) })}
                />
                <button class="icon-button" type="button" title="Adicionar item" on:click={() => addSafetyItem(column.id)}>
                  <Plus size={18} aria-hidden="true" />
                  <span class="sr-only">Adicionar item</span>
                </button>
              </div>
            </div>
          {/each}
        </section>
      {/if}

      {#if activeTab === "data"}
        <section class="grid gap-4 xl:grid-cols-[360px_1fr]">
          <div class="panel p-4">
            <h2 class="text-lg font-bold">Importar e exportar</h2>
            <div class="mt-4 grid gap-3">
              <button class="primary-button" type="button" on:click={exportJson}>
                <Download size={18} aria-hidden="true" />
                <span>Exportar JSON</span>
              </button>
              <label class="subtle-button cursor-pointer">
                <Upload size={18} aria-hidden="true" />
                <span>Importar JSON</span>
                <input class="sr-only" type="file" accept="application/json,.json" on:change={importFile} />
              </label>
              <div class="rounded-lg border border-stone-300 bg-white p-3 text-sm text-stone-600">
                <div class="flex items-center gap-2 font-semibold text-ink">
                  <FileText size={16} aria-hidden="true" />
                  <span>Estado local</span>
                </div>
                <p class="mt-2">Atualizado em {new Date(state.updatedAt).toLocaleString("pt-BR")}</p>
                <p>
                  {state.scenes.length} cenas, {state.characters.length} personagens,
                  {state.templates.length} modelos, {state.chat.length} mensagens
                </p>
              </div>
            </div>
          </div>

          <div class="panel flex min-h-[620px] flex-col p-3">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-lg font-bold">JSON bruto</h2>
              <button class="primary-button" type="button" on:click={applyJsonDraft}>
                <Upload size={18} aria-hidden="true" />
                <span>Aplicar</span>
              </button>
            </div>
            <textarea
              class="min-h-[520px] flex-1 resize-y rounded-md border border-stone-300 bg-[#1f211f] p-3 font-mono text-sm leading-6 text-[#f7f5ef]"
              spellcheck="false"
              value={jsonDraft}
              on:input={(event) => {
                jsonDirty = true;
                jsonDraft = inputValue(event);
              }}
            ></textarea>
          </div>
        </section>
      {/if}
    </main>
  </div>

  {#if showRoomSettings && room && isHost}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="presentation" on:click={(event) => event.target === event.currentTarget && (showRoomSettings = false)}>
      <div class="panel w-full max-w-lg p-5" role="dialog" aria-modal="true" aria-labelledby="room-settings-title" tabindex="-1">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs font-bold uppercase tracking-[0.14em] text-avocado">Configurações da mesa</p>
            <h2 id="room-settings-title" class="mt-1 text-2xl font-black">Cuide da casa</h2>
          </div>
          <button class="icon-button" type="button" aria-label="Fechar configurações" on:click={() => (showRoomSettings = false)}>×</button>
        </div>

        <label class="mt-5 grid gap-1 text-sm font-semibold">
          Nome da mesa
          <input class="control" bind:value={settingsName} maxlength="80" />
        </label>

        <fieldset class="mt-5 grid gap-2">
          <legend class="text-sm font-semibold">Quem pode entrar?</legend>
          <label class="flex cursor-pointer items-start gap-3 rounded-md border border-stone-300 bg-white p-3 text-sm">
            <input class="mt-0.5 h-4 w-4" type="radio" bind:group={settingsAccess} value="open" />
            <span><strong class="block">Qualquer pessoa com o código</strong><span class="text-stone-500">Ideal para mesas abertas.</span></span>
          </label>
          <label class="flex cursor-pointer items-start gap-3 rounded-md border border-stone-300 bg-white p-3 text-sm">
            <input class="mt-0.5 h-4 w-4" type="radio" bind:group={settingsAccess} value="restricted" />
            <span><strong class="block">Somente nomes autorizados</strong><span class="text-stone-500">Cada participante precisa estar na lista abaixo.</span></span>
          </label>
        </fieldset>

        <label class="mt-5 grid gap-1 text-sm font-semibold">
          Jogadores autorizados
          <textarea class="control min-h-24 resize-y" bind:value={settingsAllowedNames} placeholder="Um nome por linha" disabled={settingsAccess === "open"}></textarea>
          <span class="text-xs font-normal text-stone-500">Você pode separar os nomes por linha ou vírgula.</span>
        </label>

        <div class="mt-6 flex justify-end gap-2">
          <button class="subtle-button" type="button" on:click={() => (showRoomSettings = false)}>Cancelar</button>
          <button class="primary-button" type="button" on:click={saveRoomSettings} disabled={settingsBusy}>
            {settingsBusy ? "Salvando…" : "Salvar configurações"}
          </button>
        </div>
      </div>
    </div>
  {/if}
  {/if}
</div>
