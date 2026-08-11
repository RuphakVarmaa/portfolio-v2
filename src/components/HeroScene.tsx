import { Component, useMemo, useRef, type ErrorInfo, type ReactNode } from 'react'
import { Line } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { usePreferences } from './preferences-context'

const satellites: Array<[number, number, number]> = [
  [2.2, 0.55, 0.1],
  [-1.85, 1.35, -0.3],
  [0.5, -1.9, 0.35],
  [-2.25, -0.55, 0.2],
  [1.45, 1.8, -0.5],
  [2.05, -1.25, -0.15],
]

function seededRandom(seed: number) {
  let value = seed % 2147483647
  return () => {
    value = (value * 16807) % 2147483647
    return (value - 1) / 2147483646
  }
}

function ParticleField({ count, color }: { count: number; color: string }) {
  const positions = useMemo(() => {
    const random = seededRandom(2048)
    const values = new Float32Array(count * 3)
    for (let index = 0; index < count; index += 1) {
      const radius = 2.4 + random() * 2.2
      const theta = random() * Math.PI * 2
      const phi = Math.acos(2 * random() - 1)
      values[index * 3] = radius * Math.sin(phi) * Math.cos(theta)
      values[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      values[index * 3 + 2] = radius * Math.cos(phi)
    }
    return values
  }, [count])

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={0.025} transparent opacity={0.48} sizeAttenuation />
    </points>
  )
}

function IntelligenceCore({ reduced, theme }: { reduced: boolean; theme: 'light' | 'dark' }) {
  const group = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Mesh>(null)
  const { size } = useThree()
  const particleCount = size.width < 700 ? 120 : 300
  const accent = theme === 'dark' ? '#bfd95a' : '#6f861d'
  const neutral = theme === 'dark' ? '#c9d0ca' : '#303832'
  const targetScale = useMemo(() => new THREE.Vector3(1, 1, 1), [])

  useFrame((state, delta) => {
    if (reduced || !group.current) return
    group.current.rotation.y += delta * 0.1
    group.current.rotation.x = THREE.MathUtils.lerp(
      group.current.rotation.x,
      state.pointer.y * 0.14,
      0.035,
    )
    group.current.rotation.z = THREE.MathUtils.lerp(
      group.current.rotation.z,
      -state.pointer.x * 0.1,
      0.035,
    )
    group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, state.pointer.x * 0.2, 0.025)
    group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, state.pointer.y * 0.12, 0.025)
    group.current.scale.lerp(targetScale, 1 - Math.exp(-delta * 3.4))
    if (inner.current) inner.current.rotation.y -= delta * 0.24
  })

  return (
    <group ref={group} scale={reduced ? 1 : 0.02}>
      <ParticleField count={particleCount} color={neutral} />

      <mesh ref={inner}>
        <icosahedronGeometry args={[1.03, 3]} />
        <meshPhysicalMaterial
          color={theme === 'dark' ? '#1c2420' : '#cbd3cc'}
          roughness={0.28}
          metalness={0.76}
          clearcoat={1}
          clearcoatRoughness={0.2}
        />
      </mesh>
      <mesh scale={1.06}>
        <icosahedronGeometry args={[1.03, 2]} />
        <meshBasicMaterial color={accent} wireframe transparent opacity={0.44} />
      </mesh>
      <mesh scale={0.42}>
        <octahedronGeometry args={[1, 2]} />
        <meshStandardMaterial color={accent} roughness={0.32} metalness={0.7} />
      </mesh>

      {[1.55, 2.05, 2.58].map((radius, index) => (
        <mesh key={radius} rotation={[Math.PI / (2.8 + index), index * 0.72, index * 0.38]}>
          <torusGeometry args={[radius, 0.012, 8, 120]} />
          <meshBasicMaterial color={index === 1 ? accent : neutral} transparent opacity={0.38} />
        </mesh>
      ))}

      {satellites.map((position, index) => (
        <group key={position.join('-')}>
          <Line
            points={[[0, 0, 0], position]}
            color={index % 2 === 0 ? accent : neutral}
            transparent
            opacity={0.24}
            lineWidth={0.6}
          />
          <mesh position={position}>
            <sphereGeometry args={[index % 2 === 0 ? 0.09 : 0.055, 18, 18]} />
            <meshStandardMaterial
              color={index % 2 === 0 ? accent : neutral}
              roughness={0.3}
              metalness={0.55}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('3D scene unavailable', error, info)
  }

  render() {
    if (this.state.failed) {
      return <div className="scene-fallback" role="img" aria-label="Abstract distributed systems network" />
    }
    return this.props.children
  }
}

export default function HeroScene() {
  const { motionMode, theme } = usePreferences()
  const reduced = motionMode === 'lite'

  return (
    <SceneBoundary>
      <div className="hero-canvas" aria-hidden="true">
        <Canvas
          dpr={reduced ? 1 : [1, 1.6]}
          frameloop={reduced ? 'demand' : 'always'}
          camera={{ position: [0, 0, 7], fov: 36, near: 0.1, far: 100 }}
          gl={{
            antialias: !reduced,
            alpha: true,
            powerPreference: reduced ? 'low-power' : 'high-performance',
          }}
        >
          <ambientLight intensity={theme === 'dark' ? 0.9 : 1.8} />
          <directionalLight position={[4, 5, 4]} intensity={3.2} color="#f3f6ee" />
          <pointLight position={[-3, -2, 4]} intensity={12} distance={12} color="#9fb643" />
          <IntelligenceCore reduced={reduced} theme={theme} />
        </Canvas>
      </div>
    </SceneBoundary>
  )
}
