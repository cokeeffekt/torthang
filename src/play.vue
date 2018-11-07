<template>
  <div id="wrap">
    <div class="player-wrap">
      <video autoplay data-action="togglePlay"
        id="player"
        src="http://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4"></video>
      <div class="buttons">
        <button data-action="back2">⏪</button>
        <button data-action="pause">⏸️</button>
        <button data-action="play">▶️</button>
        <button data-action="stop">⏹️</button>
        <button data-action="back">⏩</button>
      </div>
    </div>
  </div>
</template>
