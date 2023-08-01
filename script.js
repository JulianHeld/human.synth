/********************************************************************
 // Utilities
********************************************************************/

function calculateAverage(array) {
  var total = 0;
  var count = 0;

  array.forEach(function (item, index) {
    total += item;
    count++;
  });

  return total / count;
}

/********************************************************************
 // Gesture Detector
********************************************************************/

import {
  FilesetResolver,
  GestureRecognizer,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

const demosSection = document.getElementById("demos");
let gestureRecognizer;
let enableWebcamButton;
let webcamRunning = false;
const videoHeight = "360px";
const videoWidth = "480px";

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const gestureOutput = document.getElementById("gesture_output");

// Before we can use HandLandmarker class we must wait for it to finish
// loading. Machine Learning models can be large and take a moment to
// get everything needed to run.
const createGestureRecognizer = async () => {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );
  gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
      delegate: "GPU",
    },
    runningMode: "video",
    numHands: 2,
  });
};

/********************************************************************
 // Webcam
********************************************************************/

// // Enable the live webcam view and start detection.
function enableCam() {
  if (!gestureRecognizer) {
    alert("Please wait for gestureRecognizer to load");
    return;
  }

  webcamRunning = true;

  // getUsermedia parameters.
  const constraints = {
    video: true,
  };

  // Activate the webcam stream.
  navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
    video.srcObject = stream;
    video.addEventListener("loadeddata", predictWebcam);
  });
  console.log("webcam enabled.");
}

let lastVideoTime = -1;
let results = undefined;
async function predictWebcam() {
  const webcamElement = document.getElementById("webcam");

  let nowInMs = Date.now();
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    results = gestureRecognizer.recognizeForVideo(video, nowInMs); // analyse video and recognize gestures
  }

  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  canvasElement.style.height = videoHeight;
  webcamElement.style.height = videoHeight;
  canvasElement.style.width = videoWidth;
  webcamElement.style.width = videoWidth;

  if (results.landmarks) {
    for (const landmarks of results.landmarks) {
      drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
        color: "#00FF00",
        lineWidth: 5,
      });
      drawLandmarks(canvasCtx, landmarks, { color: "#FF0000", lineWidth: 2 });
    }

    // Hier müsste man dann die Höhe der landmarks berechnen
  }

  canvasCtx.restore();

  // hier stattdess for schleife oder for each hand in gestures und in handedness …
  if (results.gestures.length > 0) {
    // parse information
    const categoryName = results.gestures[0][0].categoryName;
    const categoryScore = parseFloat(
      results.gestures[0][0].score * 100
    ).toFixed(2);

    // which hand
    if (results.handednesses[0][0].index == 0) {
      // right
      const landmarks = results.landmarks[0];
      let landmarksX = landmarks.map((element) => element.x);
      let landmarksY = landmarks.map((element) => element.y);
      var rightX = calculateAverage(landmarksX);
      var rightY = calculateAverage(landmarksY);
      console.log("right Hand coordinates: ", rightX, rightY);
    } else if (results.handednesses[0][0].index == 1) {
      // left
      const landmarks = results.landmarks[0];
      let landmarksX = landmarks.map((element) => element.x);
      let landmarksY = landmarks.map((element) => element.y);
      var leftX = calculateAverage(landmarksX);
      var leftY = calculateAverage(landmarksY);
      console.log("left Hand coordinates: ", leftX, leftY);
    }

    // print the result to console
    console.log(results, categoryName, categoryScore);

    // parse information and generate midi
    generateMidi(categoryName, categoryScore);

    // change the html interface
    gestureOutput.style.display = "block";
    gestureOutput.style.width = videoWidth;
    gestureOutput.innerText = `GestureRecognizer: ${categoryName}\n Confidence: ${categoryScore} %`;
  } else {
    gestureOutput.style.display = "none";
  }
  // Call this function again to keep predicting when the browser is ready.
  if (webcamRunning === true) {
    window.requestAnimationFrame(predictWebcam);
  }
}

/********************************************************************
 // Midi
********************************************************************/

// ############ Zustand ############
const idleChannel = 0; // Channel ohne Ton
let currentChannel = idleChannel; // aktueller Channel/Gestes (am Anfang idleChannel)
let midiOut = []; // Midi Outputs (werden in initDevices gesetzt)

// ############ Funktionen ############

function midiReady(midi) {
  // Also react to device changes.
  midi.addEventListener("statechange", (event) => initDevices(event.target));
  initDevices(midi); // see the next section!
}

function initDevices(midi) {
  // MIDI devices that you send data to.
  const outputs = midi.outputs.values();
  for (
    let output = outputs.next();
    output && !output.done;
    output = outputs.next()
  ) {
    midiOut.push(output.value);
  }
}

function sendMidiMessage(channel, pitch, velocity) {
  const noteOnMessage = [0x90, pitch, velocity];
  const noteOffMessage = [0x80, pitch, velocity];

  // Bei channel Wechsel / andere Geste
  if (channel != currentChannel) {
    // Wenn aktuell ein Ton spielt, diesen stoppen
    if (currentChannel != idleChannel) {
      const currentDevice = midiOut[currentChannel];
      currentDevice.send(noteOffMessage);
    }

    // Neuen Ton spielen
    const device = midiOut[channel];
    device.send(noteOnMessage);

    // Channel wechseln
    currentChannel = channel;
  }
}

// Übersetze Geste in Midi Channel und sende diese an sendMidiChannel
function generateMidi(gestureName, gestureConfidence) {
  const gestureToChannelMap = {
    Closed_Fist: idleChannel,
    Open_Palm: 1,
    Pointing_Up: 3,
    Thumb_Down: 4,
    Thumb_Up: 5,
    Victory: 6,
    ILoveYou: 7,
  };

  const channel = gestureToChannelMap[gestureName] || idleChannel; // Channel der Geste
  let pitch = 50; //
  let velocity = 100; // Später eventuell: y coordinate

  // send midi
  sendMidiMessage(channel, pitch, velocity);
}

/********************************************************************
 // Main
********************************************************************/

// Wird ausgefuehrt, wenn die Seite geladen ist
window.onload = function () {
  createGestureRecognizer();

  setTimeout(enableCam, 1000);

  window.navigator.requestMIDIAccess().then(
    (midi) => midiReady(midi),
    (err) => console.log("Something went wrong", err)
  );
};