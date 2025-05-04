import React, { useRef, useState, useEffect } from 'react'
import './App.css'
import defaultShader from './assets/pink-cyan-waves.frag?raw'

// Video resolution options
type Resolution = {
  name: string;
  width: number;
  height: number;
}

const resolutions: Resolution[] = [
  { name: "720p", width: 1280, height: 720 },
  { name: "1080p", width: 1920, height: 1080 },
  { name: "1440p", width: 2560, height: 1440 },
  { name: "4K", width: 3840, height: 2160 },
  { name: "8K", width: 7680, height: 4320 }
]

function App() {
  // State for shader, audio, and UI
  const [shaderCode, setShaderCode] = useState<string>(defaultShader)
  const [selectedResolution, setSelectedResolution] = useState<Resolution>(resolutions[1]) // Default to 1080p
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [shaderFile, setShaderFile] = useState<File | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [smoothedVolume, setSmoothedVolume] = useState(0)

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunks = useRef<Blob[]>([])
  const animationFrameRef = useRef<number | undefined>(undefined)
  const glRef = useRef<WebGLRenderingContext | null>(null)
  const shaderProgramRef = useRef<WebGLProgram | null>(null)
  const uniformsRef = useRef<{ [key: string]: WebGLUniformLocation | null }>({})
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const dataArrayRef = useRef<Uint8Array | null>(null)
  const shaderInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)

  // Drag & drop handlers
  const onDropShader = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith('.frag')) {
      setShaderFile(file)
      file.text().then(setShaderCode)
    }
  }
  const onDropAudio = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('audio/')) {
      setAudioFile(file)
      setAudioUrl(URL.createObjectURL(file))
    }
  }

  // File input handlers
  const onShaderFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.name.endsWith('.frag')) {
      setShaderFile(file)
      file.text().then(setShaderCode)
    }
  }

  const onAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('audio/')) {
      setAudioFile(file)
      setAudioUrl(URL.createObjectURL(file))
    }
  }

  // Click handlers to open file explorer
  const openShaderFileDialog = () => shaderInputRef.current?.click()
  const openAudioFileDialog = () => audioInputRef.current?.click()

  // Prevent default drag behaviors
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  // Audio context and Analyser
  useEffect(() => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    audioContextRef.current = ctx
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.85
    analyserRef.current = analyser
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount)

    return () => {
      ctx.close()
    }
  }, [])

  useEffect(() => {
    if (!audioUrl || !audioContextRef.current || !analyserRef.current) return
    const audio = audioRef.current
    if (!audio) return

    const ctx = audioContextRef.current
    const analyser = analyserRef.current

    if (!sourceNodeRef.current) {
      const source = ctx.createMediaElementSource(audio)
      sourceNodeRef.current = source
      source.connect(analyser)
      analyser.connect(ctx.destination)
    }
    return () => { }
  }, [audioUrl])

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      if (isRecording) handleStopRecording();
    };
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('ended', onEnded);
    };
  }, [isRecording, audioUrl]);

  // WebGL shader setup
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Update canvas resolution when selected resolution changes
    canvas.width = selectedResolution.width
    canvas.height = selectedResolution.height
    const gl = canvas.getContext('webgl')
    if (!gl) return
    glRef.current = gl

    function compileShader(src: string, type: number): WebGLShader {
      const currentGL = glRef.current
      if (!currentGL) throw new Error('WebGL context lost')
      const shader = currentGL.createShader(type)
      if (!shader) throw new Error('Failed to create shader')
      currentGL.shaderSource(shader, src)
      currentGL.compileShader(shader)
      if (!currentGL.getShaderParameter(shader, currentGL.COMPILE_STATUS)) {
        throw new Error(currentGL.getShaderInfoLog(shader) || 'Shader error')
      }
      return shader
    }
    // Compile shader
    const vertSrc = `
      attribute vec2 position;
      varying vec2 vUv;
      void main() {
        vUv = position * 0.5 + 0.5;
        gl_Position = vec4(position, 0, 1);
      }
    `
    const fragSrc = shaderCode
    let program: WebGLProgram | null = null
    try {
      const vert = compileShader(vertSrc, gl.VERTEX_SHADER)
      const frag = compileShader(fragSrc, gl.FRAGMENT_SHADER)
      program = gl.createProgram()!
      gl.attachShader(program, vert)
      gl.attachShader(program, frag)
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'Program error')
      }
      gl.useProgram(program)
      shaderProgramRef.current = program
      uniformsRef.current.u_time = gl.getUniformLocation(program, 'u_time')
      uniformsRef.current.u_volume = gl.getUniformLocation(program, 'u_volume')
      uniformsRef.current.u_resolution = gl.getUniformLocation(program, 'u_resolution')
      // Setup geometry
      const pos = gl.createBuffer()!
      gl.bindBuffer(gl.ARRAY_BUFFER, pos)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1, 1, 1
      ]), gl.STATIC_DRAW)
      const loc = gl.getAttribLocation(program, 'position')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    } catch (e) {
      // fallback: clear canvas
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      program = null
    }
    return () => {
      if (program) gl.deleteProgram(program)
    }
  }, [shaderCode, selectedResolution])

  // Animation loop: render shader, update uniforms
  useEffect(() => {
    let lastVolume = 0; // Keep track of volume locally
    function draw() {
      const gl = glRef.current
      const program = shaderProgramRef.current
      if (!gl || !program) return
      gl.useProgram(program)

      // Resolution uniform
      gl.uniform2f(uniformsRef.current.u_resolution, selectedResolution.width, selectedResolution.height)

      // Time uniform
      const t = ((audioRef.current?.currentTime || 0))
      gl.uniform1f(uniformsRef.current.u_time, t)

      // Volume uniform with improved frequency analysis
      let v = 0
      if (analyserRef.current && dataArrayRef.current) {
        analyserRef.current.getByteFrequencyData(dataArrayRef.current)
        // Average of frequency data for volume
        const arr = dataArrayRef.current
        let sum = 0
        const start = Math.floor(arr.length * 0.0)
        const end = Math.floor(arr.length * 1.0)
        for (let i = start; i < end; i++) {
          sum += arr[i]
        }
        v = Math.sqrt(sum / ((end - start) * 255)) // Normalize to 0-1 range

        // Apply smoothing
        const smoothingFactor = 0.85 // Balanced smoothing
        const amplification = 2.0    // Moderate amplification
        lastVolume = smoothingFactor * lastVolume + (1 - smoothingFactor) * v
        v = Math.min(lastVolume * amplification, 1.0)

        // Update volume state less frequently to prevent re-renders
        if (Math.abs(lastVolume - smoothedVolume) > 0.01) {
          setSmoothedVolume(lastVolume)
        }
      }
      gl.uniform1f(uniformsRef.current.u_volume, v)

      gl.viewport(0, 0, selectedResolution.width, selectedResolution.height)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      animationFrameRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [audioUrl, shaderCode, selectedResolution])

  // Video recording
  const handleRecord = async () => {
    if (!canvasRef.current || !audioRef.current) return
    setIsRecording(true)
    const stream = canvasRef.current.captureStream(30)
    const audioStream = (audioRef.current as any).captureStream()
    // Combine video and audio
    const combined = new MediaStream([
      ...stream.getVideoTracks(),
      ...audioStream.getAudioTracks()
    ])
    const recorder = new MediaRecorder(combined, { mimeType: 'video/webm' })
    recordedChunks.current = []
    recorder.ondataavailable = e => {
      if (e.data.size > 0) recordedChunks.current.push(e.data)
    }
    recorder.onstop = () => {
      setIsRecording(false)
      const blob = new Blob(recordedChunks.current, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'visualizer.webm'
      a.click()
    }
    mediaRecorderRef.current = recorder
    // Start audio from 0
    audioRef.current.currentTime = 0
    audioRef.current.play()
    recorder.start()
  }

  const handleStopRecording = () => {
    const recorder = mediaRecorderRef.current
    const audio = audioRef.current
    if (recorder && recorder.state === 'recording') {
      recorder.stop()
      if (audio) {
        audio.pause()
      }
    }
  }

  return (
    <div className="app-container">
      <h1>Audio Visualizer Shader Renderer</h1>
      <div className="drop-row">
        <input
          type="file"
          ref={shaderInputRef}
          onChange={onShaderFileChange}
          accept=".frag"
          style={{ display: 'none' }}
        />
        <input
          type="file"
          ref={audioInputRef}
          onChange={onAudioFileChange}
          accept="audio/*"
          style={{ display: 'none' }}
        />
        <div
          className="dropzone"
          onDrop={onDropShader}
          onDragOver={e => e.preventDefault()}
          onClick={openShaderFileDialog}
          style={{ cursor: 'pointer' }}
        >
          <p>Drag & drop <b>.frag</b> shader</p>
          {shaderFile && <span style={{ fontSize: '0.9em', color: '#999' }}>{shaderFile.name}</span>}
        </div>
        <div
          className="dropzone"
          onDrop={onDropAudio}
          onDragOver={e => e.preventDefault()}
          onClick={openAudioFileDialog}
          style={{ cursor: 'pointer' }}
        >
          <p>Drag & drop <b>mp3</b></p>
          {audioFile && <span style={{ fontSize: '0.9em', color: '#999' }}>{audioFile.name}</span>}
        </div>
      </div>
      <div className="visualizer-row">
        <canvas ref={canvasRef} className="visualizer-canvas" />
        <div className="controls">
          <select
            value={JSON.stringify(selectedResolution)}
            onChange={(e) => setSelectedResolution(JSON.parse(e.target.value))}
            className="resolution-select"
          >
            {resolutions.map((res) => (
              <option key={res.name} value={JSON.stringify(res)}>
                {res.name}
              </option>
            ))}
          </select>
          <audio
            ref={audioRef}
            src={audioUrl || undefined}
            controls
            style={{ width: '100%' }}
          />
          <button
            onClick={isRecording ? handleStopRecording : handleRecord}
            disabled={!audioUrl}
            style={{ marginTop: 8 }}
          >
            {isRecording ? 'Stop Recording' : 'Render Video'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
