<script lang="ts">
  import Map from '$lib/Map.svelte';
  import type { Map as GeoreferencedMap } from '@allmaps/annotation';

  let inputUrl = '';
  let currentMapSource: string | GeoreferencedMap | undefined = undefined;

  function loadMap() {
    currentMapSource = inputUrl;
  }

  // --- Svelte 4 Stores (Alternative) ---
  // const inputUrl = writable('');
  // const currentMapSource = writable<string | GeoreferencedMap | undefined>(undefined);
  // function loadMap() {
  //   currentMapSource.set($inputUrl);
  // }
  // $: inputValue = $inputUrl; // Needed for bind:value with stores

</script>

<main>
  <h1>Allmaps MapLibre Viewer</h1>

  <div class="input-area">
    <label for="map-source">IIIF URL or Allmaps Annotation ID:</label>
    <input
      type="text"
      id="map-source"
      bind:value={inputUrl}  placeholder="Enter URL or ID..."
    />
    <button on:click={loadMap}>Load Map</button>
  </div>

  {#if currentMapSource} <Map mapSource={currentMapSource} /> {:else}
    <p>Nhập URL IIIF hoặc ID Allmaps Annotation ở trên và nhấp vào "Load Map".</p>
    <p>Ví dụ URL IIIF: <code>https://digital.library.universiteitleiden.nl/iiif/presentation/1887.d.2/manifest</code></p>
    <p>Ví dụ ID Allmaps: <code>a38b4ed7ea01a36a</code> (yêu cầu API Allmaps hoặc annotation cục bộ)</p>
  {/if}

</main>

<style>
  main {
    padding: 1em;
    font-family: sans-serif;
  }

  .input-area {
    margin-bottom: 1em;
    display: flex;
    gap: 0.5em;
    align-items: center;
  }

  .input-area label {
      margin-right: 0.5em;
  }

  .input-area input {
    flex-grow: 1;
    padding: 0.5em;
  }

   .input-area button {
    padding: 0.5em 1em;
   }

   code {
    background-color: #f0f0f0;
    padding: 0.1em 0.3em;
    border-radius: 3px;
    font-family: monospace;
   }
</style>
