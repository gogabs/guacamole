<script lang="ts">
  import { ArrowRight, Crown, KeyRound, Link2, LockKeyhole, Sparkles, UsersRound } from "lucide-svelte";
  import { browser } from "$app/environment";
  import type { RoomAccess, RoomSummary } from "$lib/shared/types";

  let serverOrigin = "";
  let hostName = "";
  let newRoomName = "Uma nova aventura";
  let joinName = "";
  let roomCode = "";
  let access: RoomAccess = "open";
  let busy: "create" | "join" | "" = "";
  let errorMessage = "";

  $: canCreate = newRoomName.trim().length > 0 && hostName.trim().length > 0 && !busy;
  $: canJoin = roomCode.trim().length >= 4 && joinName.trim().length > 0 && !busy;

  function resolveServerOrigin(): string {
    const configured = import.meta.env.VITE_GUACAMOLE_SERVER as string | undefined;
    if (configured) return configured.replace(/\/$/, "");
    return window.location.port === "8000" ? window.location.origin : "http://localhost:8000";
  }

  function apiUrl(path: string): string {
    return `${serverOrigin || resolveServerOrigin()}${path}`;
  }

  async function createRoom(): Promise<void> {
    if (!canCreate) return;
    busy = "create";
    errorMessage = "";
    const name = hostName.trim();
    try {
      const response = await fetch(apiUrl("/api/rooms"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newRoomName, hostName: name, access })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Não foi possível criar a mesa.");
      localStorage.setItem("guacamole.actorName", name);
      localStorage.setItem(`guacamole.hostToken.${payload.room.id}`, payload.hostToken);
      openRoom(payload.room as RoomSummary);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Não foi possível criar a mesa.";
    } finally {
      busy = "";
    }
  }

  async function joinRoom(): Promise<void> {
    if (!canJoin) return;
    busy = "join";
    errorMessage = "";
    const name = joinName.trim();
    const code = roomCode.trim().toUpperCase();
    try {
      const response = await fetch(apiUrl(`/api/rooms/${encodeURIComponent(code)}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Não foi possível entrar nessa mesa.");
      localStorage.setItem("guacamole.actorName", name);
      openRoom(payload.room as RoomSummary);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Não foi possível entrar nessa mesa.";
    } finally {
      busy = "";
    }
  }

  function openRoom(room: RoomSummary): void {
    window.location.assign(`/${room.id}`);
  }

  function handleCodeInput(event: Event): void {
    roomCode = (event.currentTarget as HTMLInputElement).value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
  }

  function handleSubmit(event: SubmitEvent, action: "create" | "join"): void {
    event.preventDefault();
    if (action === "create") void createRoom();
    else void joinRoom();
  }

  $: if (browser && !serverOrigin) serverOrigin = resolveServerOrigin();
</script>

<svelte:head>
  <title>Guacamole — uma mesa para cada história</title>
  <meta
    name="description"
    content="Crie uma mesa compartilhada para organizar cenas, fichas e conversas de uma aventura."
  />
</svelte:head>

<main class="landing-shell min-h-screen overflow-hidden bg-[#f3f0e8] text-ink">
  <div class="landing-grain pointer-events-none fixed inset-0 opacity-40"></div>
  <div class="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-12">
    <nav class="flex items-center justify-between" aria-label="Navegação principal">
      <a href="/" class="flex items-center gap-3" aria-label="Guacamole, início">
        <span class="brand-mark"><span></span><span></span><span></span></span>
        <span class="text-xl font-black tracking-[-0.04em]">Guacamole</span>
      </a>
      <span class="hidden rounded-full border border-ink/10 bg-white/50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-stone-500 sm:block">
        mesas compartilhadas
      </span>
    </nav>

    <section class="grid flex-1 items-center gap-12 pb-10 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:pt-20">
      <div class="max-w-2xl">
        <div class="mb-6 inline-flex items-center gap-2 rounded-full border border-avocado/20 bg-avocado/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-avocado">
          <Sparkles size={14} aria-hidden="true" />
          pronto para jogar
        </div>
        <h1 class="max-w-xl text-5xl font-black leading-[0.96] tracking-[-0.07em] sm:text-7xl">
          Toda história começa com uma mesa.
        </h1>
        <p class="mt-7 max-w-lg text-lg leading-8 text-stone-600 sm:text-xl">
          Um espaço simples para reunir cenas, fichas e pessoas — com tudo no mesmo lugar, do primeiro gancho ao último dado.
        </p>
        <div class="mt-9 flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-stone-600">
          <span class="inline-flex items-center gap-2"><UsersRound size={17} class="text-avocado" /> colaboração ao vivo</span>
          <span class="inline-flex items-center gap-2"><Link2 size={17} class="text-river" /> um link por mesa</span>
        </div>
      </div>

      <div class="relative">
        <div class="landing-orbit orbit-one"></div>
        <div class="landing-orbit orbit-two"></div>
        <div class="relative grid gap-4 sm:grid-cols-2">
          <form class="landing-card landing-card-primary sm:translate-y-8" on:submit={(event) => handleSubmit(event, "create")}>
            <div class="flex items-start justify-between">
              <div class="landing-icon bg-avocado text-white"><Crown size={20} aria-hidden="true" /></div>
              <span class="rounded-full bg-avocado/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-avocado">anfitrião</span>
            </div>
            <h2 class="mt-7 text-2xl font-black tracking-[-0.04em]">Criar uma mesa</h2>
            <p class="mt-2 min-h-12 text-sm leading-6 text-stone-600">Dê um nome à aventura e cuide dos detalhes da casa.</p>
            <label class="mt-7 block text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
              Nome da mesa
              <input class="landing-input mt-2" bind:value={newRoomName} maxlength="80" placeholder="Ex.: A cidade submersa" />
            </label>
            <label class="mt-4 block text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
              Seu nome
              <input class="landing-input mt-2" bind:value={hostName} maxlength="40" placeholder="Como a mesa vai te chamar?" autocomplete="name" />
            </label>
            <button class="landing-submit mt-6" type="submit" disabled={!canCreate}>
              {#if busy === "create"}Criando…{:else}Abrir mesa <ArrowRight size={17} aria-hidden="true" />{/if}
            </button>
            <p class="mt-3 text-center text-xs text-stone-500">Você recebe um código único para compartilhar.</p>
          </form>

          <form class="landing-card landing-card-secondary" on:submit={(event) => handleSubmit(event, "join")}>
            <div class="landing-icon bg-river text-white"><KeyRound size={20} aria-hidden="true" /></div>
            <h2 class="mt-7 text-2xl font-black tracking-[-0.04em]">Entrar em uma mesa</h2>
            <p class="mt-2 min-h-12 text-sm leading-6 text-stone-600">Já recebeu um convite? Use o código da mesa para chegar direto.</p>
            <label class="mt-7 block text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
              Código da mesa
              <input class="landing-input landing-code mt-2" value={roomCode} on:input={handleCodeInput} maxlength="6" placeholder="ABC123" autocomplete="off" />
            </label>
            <label class="mt-4 block text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
              Seu nome
              <input class="landing-input mt-2" bind:value={joinName} maxlength="40" placeholder="Como podemos te chamar?" autocomplete="name" />
            </label>
            <button class="landing-submit landing-submit-blue mt-6" type="submit" disabled={!canJoin}>
              {#if busy === "join"}Entrando…{:else}Entrar na mesa <ArrowRight size={17} aria-hidden="true" />{/if}
            </button>
            <p class="mt-3 text-center text-xs text-stone-500">O código tem 6 caracteres e não diferencia maiúsculas.</p>
          </form>
        </div>
      </div>
    </section>

    {#if errorMessage}
      <div class="mx-auto mb-5 rounded-xl border border-tomato/30 bg-tomato/10 px-4 py-3 text-center text-sm font-semibold text-tomato" role="alert">
        {errorMessage}
      </div>
    {/if}

    <footer class="flex flex-col gap-3 border-t border-ink/10 pt-5 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
      <span>Uma ferramenta para histórias feitas em conjunto.</span>
      <span class="inline-flex items-center gap-2"><LockKeyhole size={13} aria-hidden="true" /> cada mesa tem seu próprio espaço</span>
    </footer>
  </div>
</main>

<style>
  .landing-shell { font-family: "Trebuchet MS", Inter, ui-sans-serif, system-ui, sans-serif; }
  .landing-grain {
    background-image: radial-gradient(rgba(32, 33, 31, .12) .7px, transparent .7px);
    background-size: 9px 9px;
    mask-image: linear-gradient(to bottom, black, transparent 75%);
  }
  .brand-mark { position: relative; display: inline-flex; height: 30px; width: 30px; transform: rotate(-9deg); align-items: flex-end; gap: 2px; }
  .brand-mark span { display: block; width: 8px; border-radius: 8px 8px 3px 3px; background: #52734d; }
  .brand-mark span:nth-child(1) { height: 16px; transform: rotate(-12deg); }
  .brand-mark span:nth-child(2) { height: 26px; background: #bd8424; }
  .brand-mark span:nth-child(3) { height: 20px; transform: rotate(10deg); background: #326c8f; }
  .landing-card { position: relative; overflow: hidden; border: 1px solid rgba(32, 33, 31, .12); border-radius: 22px; padding: 24px; box-shadow: 0 12px 40px rgba(32, 33, 31, .09); }
  .landing-card::after { position: absolute; right: -40px; top: -44px; height: 120px; width: 120px; border-radius: 999px; background: rgba(255,255,255,.35); content: ""; }
  .landing-card-primary { background: #fffdf8; }
  .landing-card-secondary { background: #e7eef0; }
  .landing-icon { position: relative; z-index: 1; display: inline-flex; height: 42px; width: 42px; align-items: center; justify-content: center; border-radius: 13px; }
  .landing-input { width: 100%; border: 1px solid rgba(32, 33, 31, .17); border-radius: 10px; background: rgba(255,255,255,.75); padding: 11px 12px; color: #20211f; outline: none; transition: border-color .15s, box-shadow .15s; }
  .landing-input:focus { border-color: #52734d; box-shadow: 0 0 0 3px rgba(82,115,77,.16); }
  .landing-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.05rem; font-weight: 800; letter-spacing: .2em; }
  .landing-submit { display: inline-flex; width: 100%; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 10px; background: #52734d; padding: 12px 16px; color: white; font-size: .9rem; font-weight: 800; transition: transform .15s, background .15s; }
  .landing-submit:hover:not(:disabled) { transform: translateY(-1px); background: #496744; }
  .landing-submit:disabled { cursor: not-allowed; opacity: .45; }
  .landing-submit-blue { background: #326c8f; }
  .landing-submit-blue:hover:not(:disabled) { background: #285b78; }
  .landing-orbit { position: absolute; border: 1px dashed rgba(82,115,77,.24); border-radius: 999px; }
  .orbit-one { right: -42px; top: -60px; height: 220px; width: 220px; }
  .orbit-two { bottom: -80px; left: -65px; height: 180px; width: 180px; border-color: rgba(50,108,143,.2); }
  @media (max-width: 639px) { .landing-card { padding: 20px; } }
</style>
