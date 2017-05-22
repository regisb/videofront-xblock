function VideofrontXBlock(runtime, element, args) {
  'use strict';
  var require = require || RequireJS.require;
  require([args.video_js_url], function(videojs) {

    console.log("videojs:", videojs);

    //////////////////////////////////////////////////////

    /*
     * Resolution switcher plugin, largely inspired by
     * https://github.com/kmoskwiak/videojs-resolution-switcher (licensed under Apache 2.0)
     * Changes were made to make this plugin compatible with videojs 4. We can
     * probably get rid of this once videojs gets upgraded to v5.
     */
    var defaults = {};
    var resolutionSwitcher = function(options) {
      var settings = videojs.util.mergeOptions(defaults, options),
          player = this;

      /*
       * Resolution menu item
       */
      var ResolutionMenuItem = videojs.MenuItem.extend({
        init: function(player, options){
          videojs.MenuItem.call(this, player, options);
          this.src = options.src;
          this.type = options.type;
          this.label = options.label;
          this.res = options.res;

          this.on('click', videojs.bind(this, this.switchResolution));
          player.on('resolutionchange', videojs.bind(this, this.checkIfSelected));
        },
        switchResolution: function() {
          player.changeSrc({
            label: this.label,
            res: this.res,
            src: this.src,
            type: this.type,
          });
        },
        checkIfSelected: function() {
          var ariaSelected = this.player().currentSrc.res === this.res ? 'true' : 'false';
          var elt = $(this.el());
          elt.attr('aria-selected', ariaSelected);
          if (ariaSelected == 'true') {
            elt.addClass('vjs-selected');
          } else {
            elt.removeClass('vjs-selected');
          }
        }
      });


     /*
      * Resolution menu button
      */
      var ResolutionMenuButton = videojs.MenuButton.extend({
        className: 'vjs-resolution-button',
        init: function(player, options){
          this.sources = options.sources;
          player.on('resolutionchange', videojs.bind(this, this.updateLabel));
          videojs.MenuButton.call(this, player, options);
        },
      });
      ResolutionMenuButton.prototype.createItems = function() {
        var menuItems = [];
        for(var i = 0; i < this.sources.length; i++){
          menuItems.push(new ResolutionMenuItem(player, {
            label: this.sources[i].label,
            res: this.sources[i].res,
            src: this.sources[i].src,
            type: this.sources[i].type,
          }));
        }
        return menuItems;
      };
      ResolutionMenuButton.prototype.updateLabel = function(e) {
        // For some reason, createEl does not get called, so we need to call it manually
        var labelEl = $(this.el()).find('.vjs-resolution-value');
        if (labelEl.length === 0) {
          labelEl = $("<div></div>").addClass('vjs-resolution-value vjs-menu-button-value');
          $(this.el()).append(labelEl);
        }
        labelEl.html(this.player().currentSrc.label);
      };

      videojs.Player.prototype.setSrc = function(src) {
        this.src(src);
        this.currentSrc = src;
        this.trigger('resolutionchange', src);
        return this;
      };
      videojs.Player.prototype.changeSrc = function(src) {
        if (src === this.currentSrc) {
          return;
        }
        this.bigPlayButton.hide();
        var currentTime = this.currentTime();
        var isPaused = this.paused();

        this.setSrc(src);

        // For some reason, we used to have to trigger the following code only
        // after a 'loadedmetada' event with libcast. Weirdly, this is not the
        // case anymore with S3.
        this.currentTime(currentTime);
        if(!isPaused) {
          this.play();
        } else {
          // The control bar is hidden because the player considers this is the
          // first play. Unfortunately we can't call the hasStarted method
          // because it is hidden in the obfuscated library.
          this.addClass("vjs-has-started");
        }
      };

      videojs.Player.prototype.updateSrc = function(src) {
        //Return current src if src is not given
        if(!src){ return this.src(); }
        // Dispose old resolution menu button before adding new sources
        if(this.controlBar.resolutionSwitcher){
          this.controlBar.resolutionSwitcher.dispose();
          delete this.controlBar.resolutionSwitcher;
        }
        //Sort sources
        src = src.sort(compareResolutions);
        var menuButton = new ResolutionMenuButton(this, {sources: src});
        this.controlBar.resolutionSwitcher = this.controlBar.addChild(menuButton);
        this.setSrc(chooseSrc(src));
      };

      /**
       * Method used for sorting list of sources
       * @param   {Object} a source object with res property
       * @param   {Object} b source object with res property
       * @returns {Number} result of comparation
       */
      function compareResolutions(a, b){
        if(!a.res || !b.res) return 0;
        return (+b.res)-(+a.res);
      }

      /**
       * Choose src if option.default is specified
       * @param   {Array}  src Array of sources
       * @returns {Object} source object
       */
      function chooseSrc(sources){
        for (var s = 0; s < sources.length; s += 1) {
          if (sources[s].res === settings.defaultRes) {
            return sources[s];
          }
        }
        return sources[0];
      }

      // Create resolution switcher for videos form <source> tag inside <video>
      var sourceTags = $(player.el()).find('source');
      if(sourceTags.length > 1) {
        var newSources = [];
        sourceTags.each(function(){
          newSources.push({
            src: $(this).attr("src"),
            res: $(this).attr("res"),
            type: $(this).attr("type"),
            label: $(this).attr("label"),
          });
        });
        player.updateSrc(newSources);
      }
    };

    // Associate plugin to videojs
    videojs.plugin('resolutionSwitcher', resolutionSwitcher);

    // Create player function
    var videoplayer = function (elt) {
      var player = videojs(elt);

      // Resolution switching
      player.resolutionSwitcher({
        defaultRes: "512"
      });

      // CSS
      $(player.el()).find(
        ".vjs-resolution-button .vjs-menu-button-value"
      ).css("font-size", "1.5em").css("line-height", "2");
      $(player.el()).find(
        ".vjs-resolution-button .vjs-menu-item"
      ).css("text-transform", "none");
      $(player.el()).find(
        ".vjs-subtitles-button .vjs-menu-item"
      ).css("text-transform", "none");

      return player;
    };


    /////////////////////////////////////////////////////

    var videoPlayerElement = $(element).find('.videoplayer');
    var transcriptElement = videoPlayerElement.find(".transcript");
    var player = videoplayer(videoPlayerElement.find('video')[0]);

    // Configure transcripts
    player.one('loadedmetadata', function() {
      var tracks = player.textTracks();

      // Change track
      tracks.addEventListener('change', function() {

        var enableTranscript = false;
        for (var t = 0; t < this.length; t++) {
          var track = this[t];
          if (track.mode === 'showing') {
            showTranscript(track);
            enableTranscript = true;
          }
        }
        if (!enableTranscript) {
          disableTranscript();
        }
      });

      // Highlight current cue
      for (var t = 0; t < tracks.length; t++) {
        tracks[t].addEventListener('cuechange', oncuechange);
      }
    });

    var showTranscript = function(track) {
      var cues = track.cues;

      // We need to check whether the track is still the one currently showing.
      if (track.mode !== "showing") {
        return;
      }

      // Cues may not be loaded yet. If not, wait until they are. This is
      // suboptimal, but there is no other event to help us determine whether a
      // track was correctly loaded.
      if (!cues || cues.length === 0) {
        window.setTimeout(function() { showTranscript(track); }, 2);
      }

      var htmlContent = "";
      for (var c = 0; c < cues.length; c++) {
        var cue = cues[c];
        htmlContent += "<span class='cue' begin='" + cue.startTime + "'>&nbsp;-&nbsp;" + cue.text + "</span><br/>\n";
      }

      player.width("61%");
      videoPlayerElement.addClass("transcript-enabled");
      transcriptElement.html(htmlContent);

      // Go to time on cue click
      transcriptElement.find(".cue").click(function() {
          player.currentTime($(this).attr('begin'));
      });
    };

    var disableTranscript = function() {
      videoPlayerElement.removeClass("transcript-enabled");
      player.width("100%");
    };

    var oncuechange = function() {
      transcriptElement.find(".current.cue").removeClass("current");
      var cueElement;
      for (var c = 0; c < this.activeCues.length; c++) {
        cueElement = transcriptElement.find(".cue[begin='" + this.activeCues[c].startTime + "']");
        cueElement.addClass("current");
      }
      if (cueElement) {
        // Scroll to cue
        var newtop = transcriptElement.scrollTop() - transcriptElement.offset().top + cueElement.offset().top;
        transcriptElement.animate({
            scrollTop: newtop
        }, 500);
      }
    };

    // Listen to events
    var logTimeOnEvent = function(eventName, logEventName, currentTimeKey, data) {
      player.on(eventName, function() {
        logTime(logEventName, data, currentTimeKey);
      });
    };
    var logTime = function(logEventName, data, currentTimeKey) {
      data = data || {};
      currentTimeKey = currentTimeKey || 'currentTime';
      data[currentTimeKey] = parseInt(player.currentTime());
      log(logEventName, data);
    };
    var logOnEvent = function(eventName, logEventName, data) {
      data = data || {};
      player.on(eventName, function() {
          log(logEventName, data);
      });
    };
    function log(eventName, data) {
        var logInfo = {
          course_id: args.course_id,
          video_id: args.video_id,
        };
        if (data) {
          $.extend(logInfo, data);
        }
        Logger.log(eventName, logInfo);
    }

    logTimeOnEvent('seeked', 'seek_video', 'new_time');
    logTimeOnEvent('ended', 'stop_video');
    logTimeOnEvent('pause', 'pause_video');
    logTimeOnEvent('play', 'play_video');
    logOnEvent('loadstart', 'load_video');
    log('video_player_ready');
    // Note that we have no show/hide transcript button, so there is nothing to
    // log for these events

    player.on('ratechange', function() {
      logTime('speed_change_video', { newSpeed: player.playbackRate() });
    });
  });
}
