var legionAudioLoaded;

function legionAudio() {
  if (legionAudioLoaded) {
    return;
  }

  legionAudioLoaded = true;

  api.debug.log('Adding Legion Audio');

  oldProcessEvent = audioModel.processEvent

  // START OF STUFF COPIED DIRECTLY FROM AUDIO.JS

  var audio_response_que = [];
  var global_audio_response_timeout = 3 * 1000 /* in ms*/;
  var global_timeout_active = false;

  var audio_response_priority_level = 0;
  var starting_priority_level = 3;
  var priority_level_cooldown = 30 * 1000 /* in ms*/;
  var priority_level_timeout;

  var defeated = false;

  var maybePlayQueuedResponse = function (clear_cooldown) {
    if (clear_cooldown && !audio_response_que.length)
      global_timeout_active = false;
    else
      global_timeout_active = true;

    if (!audio_response_que.length)
      return;

    var entry = audio_response_que.shift();

    if (audio_response_priority_level <= entry.priority || entry.priority === -1)
      api.audio.playSoundAtLocation(entry.cue, 0, 0, 0);

    setTimeout(function () { maybePlayQueuedResponse(true) }, global_audio_response_timeout);
  };
  var enqueueAudioResponse = function (cue, priority) {
    audio_response_que.push({ cue: cue, priority: priority });

    if (audio_response_que.length === 1 && !global_timeout_active)
      maybePlayQueuedResponse();
  };

  var setAudioResponsePriorityLevel = function (level) {
    if (level < 0)
      return;

    if (level > audio_response_priority_level)
      audio_response_que.length = 0;

    audio_response_priority_level = level;
    clearTimeout(priority_level_timeout);

    if (level > 0)
      priority_level_timeout = setTimeout(function () {
        setAudioResponsePriorityLevel(level - 1);
      }, priority_level_cooldown);
  };
  setAudioResponsePriorityLevel(starting_priority_level);

  function AudioResponseModel(options) {
    var self = this;

    var simple_audio = typeof options.audio === 'string';
    var lastTriggerTime = _.now();
    var sequence = -1;
    var has_played = false;
    var priority = options.ignore_priority ? -1 : (options.priority || 0);
    var always_play = options.always_play;

    var resolve = function (cue, skip) {
      var simple_cue = typeof cue === 'string';
      var target = simple_cue ? cue : cue[Math.min(sequence, cue.length - 1)];

      if (skip)
        api.audio.playSoundAtLocation(target, 0, 0, 0);
      else
        enqueueAudioResponse(target, priority);
    }

    var play = function () {
      ++sequence;

      if (options.play_once && has_played)
        return;

      if (priority && !options.ignore_priority && priority >= audio_response_priority_level)
        setAudioResponsePriorityLevel(priority);

      has_played = true;

      if (simple_audio)
        resolve(options.audio);
      else
        _.forEach(options.audio, function (element, index) { /* expects an array of arrays where the first value is a delay and the second value is an audio cue */
          _.delay(function () {
            resolve(element[1], !!index); /* only enqueue the first value... that way we can ignore the global audio cooldown */
          }, element[0]);
        });
    };

    self.trigger = function () {
      if (!always_play)
        if (!options.ignore_priority && priority < audio_response_priority_level)
          return;

      var now = _.now();
      var delta = now - lastTriggerTime;

      if (!options.reset || delta > options.reset) {
        sequence = -1;
      }

      if (!options.interval || delta > options.interval) {
        lastTriggerTime = now;
        play();
      }

    };
  };

  // END OF STUFF COPIED DIRECTLY FROM AUDIO.JS

  // Add Legion notifications
  audioModel.processEvent = function (event_type, sub_type) {

    if (defeated)
      return;

    legionResponses = {};

    // Add MLA alerts for Legion units
    legionResponses[constants.event_type.sight] = {
      '/pa/units/land/l_nuke_launcher/l_nuke_launcher.json': new AudioResponseModel({
        audio: '/VO/Computer/site_nuke_installation',
        priority: 2
      }),
    }

    var response = legionResponses[event_type];
    var use_sub_type = sub_type !== -1;

    if (response) {
      // Note: This strips off spec tags when looking for a sub-type
      var specNameMatch = /.*\.json/.exec(sub_type);
      if (specNameMatch)
        sub_type = specNameMatch.pop();
      if (use_sub_type && response[sub_type])
        response = response[sub_type];

      if (response.trigger)
        response.trigger();
    }

    return oldProcessEvent(event_type, sub_type)

  }

}

try {
  legionAudio();
}
catch (e) {
  console.error(e);
}