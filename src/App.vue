<template>
  <div id="wrap" @mousemove="mouseMove">
    <div class="player-wrap" v-if="currentlyPlaying && playingUri">
      <video autoplay @click="videoTogglePlay"
        ref="video"
        @error="videoStop(true)"
        @ended="videoNext(true)"
        :src="playingUri"></video>
      <div class="buttons" :class="{show: recentMouseMove}">
        <div>
          {{currentlyPlaying.name.replace(loadedTorrent.overlap, '')}}
        </div>
        <button @click="videoRestart">⏮️</button>
        <button @click="videoReplay(5)">⏪</button>
        <button @click="videoPause">⏸️</button>
        <button @click="videoPlay">▶️</button>
        <button @click="videoStop">⏹️</button>
        <button @click="videoForward(5)">⏩</button>
        <button @click="videoNext">⏭️</button>
        <br>
        <span>{{showPlayTime}}</span>
      </div>
    </div>
    <div class="find-wrap"
      :class="{collapsed: collapsed, closed: closed}">
      <div class="find-inner">
        <input type="search"
          v-model="magnetInput"
          placeholder="Magnet Link"
          @focus="magnetInputFocus = true"
          @blur="inputBlur">
        <template v-if="loadedTorrent">
          <h4>{{loadedTorrent.name}}

            <select v-model="quality">
              <option value="240">240p</option>
              <option value="360">360p</option>
              <option value="480">480p</option>
            </select>
          </h4>
          <ul>
            <li v-for="file in loadedTorrent.files"
               :key="file.length+file.name"
               :class="{playing: currentlyPlaying === file}"
               @click="playFile(file)">
               {{file.name.replace(loadedTorrent.overlap, '')}}
          </li>
          </ul>
        </template>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'app',
  data () {
    return {
      msg: 'Welcome to Your Vue.js Apeep!',
      magnetInput: null,
      magnetInputFocus: false,
      nearEdge: false,
      loadedTorrent: null,
      currentlyPlaying: null,
      recentMouseMove: false,
      showPlayTime: null,
      playingUri: false,
      quality: '240'
    };
  },
  watch: {
    magnetInput () {
      // magnet:?xt=urn:btih:4e19ac9addb274e78cf191fbda81d18c84724ed7
      clearTimeout(this.fetchThrottle);
      this.fetchThrottle = setTimeout(_ => {
        this.fetchMagnetContents(this.magnetInput);
      }, 500);
    },
    playingUriSet (nv, ov) {
      clearTimeout(this.playingUriThrottle);
      if (!nv || !ov)
        return (this.playingUri = nv);
      this.playingUriThrottle = setTimeout(_ => {
        this.playingUri = nv;
      }, 750);
    }
  },
  computed: {
    collapsed () {
      return !!this.currentlyPlaying;
    },
    closed () {
      if (this.currentlyPlaying && !this.nearEdge)
        return true;
      return false;
    },
    playingUriSet () {
      if (!this.currentlyPlaying) return false;
      return `/ffmpeg/${this.currentlyPlaying.hash}/${this.currentlyPlaying.slug}?s=${this.currentlyPlaying.timeOffset}&q=${this.quality}`;
    }
  },
  created () {
    setInterval(this.secondInt, 1000);
  },
  methods: {
    playFile (file) {
      this.currentlyPlaying = file;
    },
    inputBlur () {
      this.magnetInputFocus = false;
      // this.fetchMagnetContents();
      // this.magnetInput = req.url.match(/btih:([a-z0-9]*)/i);
    },
    mouseMove (e) {
      if (e && e.pageX < 300)
        this.nearEdge = true;
      else
        this.nearEdge = false;

      this.recentMouseMove = true;
      clearTimeout(this.moveThrottle);
      this.moveThrottle = setTimeout(_ => {
        this.recentMouseMove = false;
      }, 5000);
    },
    fetchMagnetContents (mag) {
      if (!mag.includes('magnet:?xt=urn:btih:')) return;
      fetch('/' + mag, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        method: 'GET'
      })
        .then(res => {
          if (res.ok)
            return res.json();
          return Promise.reject(res);
        })
        .then(json => {
          json.overlap = textOverLap(json.files.map(e => e.name));
          json.files.forEach(f => {
            f.hash = json.hash;
            f.timeOffset = 0;
          });
          this.loadedTorrent = json;
        })
        .catch(err => {
          console.warn(err);
        });
    },
    videoPause () {
      this.$refs.video.pause();
    },
    videoNext (fromEnd) {
      var fIdx = this.loadedTorrent.files.findIndex(f => f === this.currentlyPlaying);
      if (fromEnd)
        this.currentlyPlaying.timeOffset = 0;
      if (fIdx < 0 || !this.loadedTorrent.files[fIdx + 1]) {
        this.$refs.video.pause();
        this.currentlyPlaying = null;
        return;
      }

      this.currentlyPlaying = this.loadedTorrent.files[fIdx + 1];
    },
    videoRestart () {
      this.currentlyPlaying.timeOffset = 0;
    },
    videoReplay (mins) {
      this.currentlyPlaying.timeOffset = Math.max((parseInt(this.currentlyPlaying.timeOffset) + Math.round(this.$refs.video.currentTime)) - (mins * 60), 0);
    },
    videoForward (mins) {
      this.currentlyPlaying.timeOffset = (parseInt(this.currentlyPlaying.timeOffset) + Math.round(this.$refs.video.currentTime)) + (mins * 60);
    },
    videoPlay () {
      this.$refs.video.play();
    },
    videoTogglePlay () {
      if (this.$refs.video.paused)
        return this.$refs.video.play();
      this.$refs.video.pause();
    },
    videoStop (err) {
      this.$refs.video.pause();
      this.currentlyPlaying.timeOffset = parseInt(this.currentlyPlaying.timeOffset) + Math.round(Math.round(this.$refs.video.currentTime));
      if (err)
        this.currentlyPlaying.timeOffset = 0;
      this.currentlyPlaying = null;
    },
    secondInt () {
      if (!this.currentlyPlaying)
        return (this.showPlayTime = null);
      var t = parseInt(this.currentlyPlaying.timeOffset) + Math.round(Math.round(this.$refs.video.currentTime));
      var date = new Date(null);
      date.setSeconds(parseInt(t)); // specify value for SECONDS here
      this.showPlayTime = date.toISOString().substr(11, 8);
    }
  }
};

function textOverLap (arrayOfStrings) {
  var shortest = arrayOfStrings.map(e => e.length).sort().shift();
  var matched = '';
  var matchLength = 1;
  var t;

  while (shortest > 0) {
    t = arrayOfStrings.filter(s => {
      return s.substring(0, matchLength) === arrayOfStrings[0].substring(0, matchLength);
    }).length;
    if (t === arrayOfStrings.length)
      matched = arrayOfStrings[0].substring(0, matchLength);

    shortest--;
    matchLength++;
  }
  return matched;
}
</script>

<style lang="stylus">
html,body
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  padding: 0;
  margin: 0;
  background: #333;
  font-size: 14px;
  font-family sans-serif
  color white
  position relative

*
*:before
*:after
  -webkit-tap-highlight-color: transparent;
  box-sizing border-box
  -webkit-font-smoothing antialiased

#wrap
  position relative
  width: 100%;
  height: 100%;

  .find-wrap
    width: 100%
    height: 100%
    display: block
    transition all 300ms ease-out
    position absolute
    background: #3C3C44;
    left 0

    &.collapsed
      width 300px

    &.closed
      left -300px

    .find-inner
      position absolute
      width 500px
      max-width 100%
      height auto;
      top 50%
      left 50%
      transform translateX(-50%) translateY(-50%);

      input
        width 100%
        font-size 1.5rem
        padding 0.5rem
        outline none
        border-radius 0px
        border none
        user-select all

      h4
        select
          float right

      ul
        list-style none
        margin 0
        padding 1rem 0

        li
          padding 0.5rem
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          cursor pointer
          transition background-color 100ms ease-out

          &.playing
            background-color rgba(blue, 0.1)

          &:hover:not(.playing)
            background-color rgba(white, 0.05)

  .player-wrap
    width 100%
    position absolute
    top 50%
    left 50%
    transform translateX(-50%) translateY(-50%);

    video
      width: 100%;

    .buttons
      text-align: center;
      position: relative;
      bottom: 1rem;
      background-color rgba(black, 0.6)
      border-radius 5px
      padding 1rem
      left 50%
      display: inline-block;
      transform translateX(-50%) translateY(-100%)
      opacity 0
      transition opacity 250ms ease-out

      &.show
        opacity 1

      >div
        text-align: center;
        margin-bottom 0.5rem

      button
        border: none;
        background: transparent;
        padding: 0;
        margin: 0;
        cursor: pointer;
        font-size: 2rem;
        outline: none;

</style>
