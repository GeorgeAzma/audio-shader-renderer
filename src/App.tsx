import React, { useRef, useState, useEffect } from 'react'
import './App.css'
import newShader from './assets/blue-waves.frag?raw'

// Default to the new shader
const defaultShader = newShader

function App() {
  // State for shader, audio, and UI
  const [shaderCode, setShaderCode] = useState<string>(defaultShader)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [volume, setVolume] = useState(0)
  const [smoothedVolume, setSmoothedVolume] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

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

  // Audio setup and volume analysis
  useEffect(() => {
    if (!audioUrl) return
    const audio = audioRef.current
    if (!audio) return
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    audioContextRef.current = ctx
    const source = ctx.createMediaElementSource(audio)
    sourceNodeRef.current = source
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 64 // Increased for better resolution
    analyser.smoothingTimeConstant = 0.85 // Add smoothing
    source.connect(analyser)
    analyser.connect(ctx.destination)
    analyserRef.current = analyser
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount)
    return () => {
      ctx.close()
    }
  }, [audioUrl])

  // WebGL shader setup
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
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
  }, [shaderCode])

  // Animation loop: render shader, update uniforms
  useEffect(() => {
    function draw() {
      const gl = glRef.current
      const program = shaderProgramRef.current
      if (!gl || !program) return
      gl.useProgram(program)

      // Resolution uniform
      gl.uniform2f(uniformsRef.current.u_resolution, gl.drawingBufferWidth, gl.drawingBufferHeight)

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
        // Focus on more meaningful frequency range (skip very low frequencies)
        const start = Math.floor(arr.length * 0.1) // Start at 10% of frequency range
        const end = Math.floor(arr.length * 0.8)   // End at 80% of frequency range
        for (let i = start; i < end; i++) {
          sum += arr[i]
        }
        v = sum / ((end - start) * 255) // Normalize to 0-1 range

        // Apply smoothing
        const smoothingFactor = 0.85 // Balanced smoothing
        const amplification = 2.0    // Moderate amplification
        const newSmoothedVolume = smoothingFactor * smoothedVolume + (1 - smoothingFactor) * v
        setSmoothedVolume(newSmoothedVolume)
        setVolume(v)

        // Use smoothed and amplified volume for shader
        v = Math.min(newSmoothedVolume * amplification, 1.0)
      }
      gl.uniform1f(uniformsRef.current.u_volume, v)

      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      animationFrameRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [audioUrl, shaderCode, smoothedVolume])

  // Audio time update
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => setCurrentTime(audio.currentTime)
    const onLoaded = () => setDuration(audio.duration)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onLoaded)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onLoaded)
    }
  }, [audioUrl])

  // Video recording
  const handleRecord = async () => {
    if (!canvasRef.current || !audioRef.current) return
    setIsRecording(true)
    const stream = canvasRef.current.captureStream(60)
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
    // Stop when audio ends
    audioRef.current.onended = () => {
      recorder.stop()
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
          <p>Drag & drop <b>.frag</b> shader file here<br />or click to browse<br /><span style={{ fontSize: '0.9em', color: '#888' }}>(or use test shader)</span></p>
        </div>
        <div
          className="dropzone"
          onDrop={onDropAudio}
          onDragOver={e => e.preventDefault()}
          onClick={openAudioFileDialog}
          style={{ cursor: 'pointer' }}
        >
          <p>Drag & drop <b>mp3</b> file here<br />or click to browse</p>
          {audioFile && <span style={{ fontSize: '0.9em' }}>{audioFile.name}</span>}
        </div>
      </div>
      <div className="visualizer-row">
        <canvas ref={canvasRef} width={640} height={360} className="visualizer-canvas" />
        <div className="controls">
          <audio
            ref={audioRef}
            src={audioUrl || undefined}
            controls
            style={{ width: '100%' }}
          />
          <div className="volume-bar">
            <div className="volume-fill" style={{ width: `${Math.min(volume * 100, 100)}%` }} />
          </div>
          <div className="time-info">
            {Math.floor(currentTime)} / {Math.floor(duration)} sec
          </div>
          <button onClick={handleRecord} disabled={!audioUrl || isRecording} style={{ marginTop: 8 }}>
            {isRecording ? 'Rendering...' : 'Render Video'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
