import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Pose } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { POSE_CONNECTIONS } from '@mediapipe/pose';
import './App.css';

const TAI_CHI_SYSTEM_PROMPT = `You are a Tai Chi form coach specializing in the Yang 24 form. 
You receive body landmark data from a pose detection system and provide brief, calm, specific coaching feedback.
Each landmark has x, y coordinates (0-1 range, relative to frame).
Key landmarks: 11=left shoulder, 12=right shoulder, 13=left elbow, 14=right elbow, 
15=left wrist, 16=right wrist, 23=left hip, 24=right hip, 25=left knee, 26=right knee.
Give ONE specific, actionable coaching tip in 1-2 sentences. 
Be calm, encouraging, and precise. Focus on posture, alignment, and flow.
Examples: "Relax your shoulders down away from your ears." 
"Bend your knees slightly deeper to lower your center of gravity."
"Let your wrists lead the movement with soft, flowing energy."`;

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef(null);
  const poseRef = useRef(null);
  const lastCallRef = useRef(0);
  const landmarksRef = useRef(null);

  const [started, setStarted] = useState(false);
  const [feedback, setFeedback] = useState('Stand in front of the camera. Begin your form when ready.');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const getClaudeFeedback = useCallback(async (landmarks) => {
    const now = Date.now();
    if (now - lastCallRef.current < 5000 || isAnalyzing) return;
    lastCallRef.current = now;
    setIsAnalyzing(true);

    const keyPoints = {
      left_shoulder: landmarks[11],
      right_shoulder: landmarks[12],
      left_elbow: landmarks[13],
      right_elbow: landmarks[14],
      left_wrist: landmarks[15],
      right_wrist: landmarks[16],
      left_hip: landmarks[23],
      right_hip: landmarks[24],
      left_knee: landmarks[25],
      right_knee: landmarks[26],
      left_ankle: landmarks[27],
      right_ankle: landmarks[28],
    };

    const simplified = Object.entries(keyPoints).reduce((acc, [key, val]) => {
      if (val) acc[key] = { x: val.x.toFixed(2), y: val.y.toFixed(2), visibility: val.visibility?.toFixed(2) };
      return acc;
    }, {});

    try {
      const response = await fetch('https://claudeproxy.clashworldgame88.workers.dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: TAI_CHI_SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: `Current pose landmarks (x,y are 0-1 normalized coordinates, y increases downward):\n${JSON.stringify(simplified, null, 2)}\n\nProvide one coaching tip for this tai chi practitioner.`
          }]
        })
      });

      const data = await response.json();
      const tip = data.content?.[0]?.text || 'Keep flowing. Maintain your center.';
      setFeedback(tip);
    } catch (err) {
      console.error('Claude API error:', err);
      setFeedback('Stay present. Continue your form with slow, deliberate movement.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [isAnalyzing]);

  useEffect(() => {
    if (!started) return;

    const pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults((results) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      canvas.width = results.image.width;
      canvas.height = results.image.height;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (results.poseLandmarks) {
        drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
          color: '#4ade80',
          lineWidth: 2,
        });
        drawLandmarks(ctx, results.poseLandmarks, {
          color: '#ffffff',
          lineWidth: 1,
          radius: 4,
        });

        landmarksRef.current = results.poseLandmarks;
        getClaudeFeedback(results.poseLandmarks);
      }
    });

    poseRef.current = pose;

    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        if (poseRef.current && videoRef.current) {
          await poseRef.current.send({ image: videoRef.current });
        }
      },
      width: 1280,
      height: 720,
    });

    camera.start();
    cameraRef.current = camera;

    return () => {
      camera.stop();
      pose.close();
    };
  }, [started, getClaudeFeedback]);

  const handleStart = () => setStarted(true);

  return (
    <div className="app">
      {!started ? (
        <div className="start-screen">
          <h1>太極拳 Tai Chi</h1>
          <p>AI Form Coach — Yang 24 Style</p>
          <button className="start-btn" onClick={handleStart}>
            BEGIN PRACTICE
          </button>
        </div>
      ) : (
        <div className="camera-container">
          <video ref={videoRef} autoPlay playsInline muted />
          <canvas ref={canvasRef} />
          <div className="status-bar">
            <div className="status-dot" />
            <span className="status-text">
              {isAnalyzing ? 'ANALYZING...' : 'TRACKING'}
            </span>
          </div>
          <div className="feedback-panel">
            <div className="label">Coach</div>
            <div className="tip">{feedback}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;