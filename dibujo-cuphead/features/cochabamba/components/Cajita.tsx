'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CAJITA, CENTRO_CAJITA, COREOGRAFIA, VISTA_CIELO } from '../constantes/carta'
import { CAMARA_VALLE } from '../constantes/valle'
import { CAJITA_FRAG, CAJITA_VERT, DESTELLO_CAJITA_FRAG, DESTELLO_CAJITA_VERT } from '../shaders/cajita'
import { CARTA, desdeLlegada } from '../store/carta'
import { crearQuadInstanciado } from '../utils/flores'
import type { UniformesValle } from './VidaDelValle'

/**
 * La cajita del final (ver `store/carta.ts`): una caja de regalo celeste con lunares, su cinta y su
 * lazo dorados, sobre un tocón entre las flores, a la derecha del lirio del ramo. Cerrada, de vez en
 * cuando se menea (como un regalo que quiere que lo abran) y titilan unas estrellitas a su alrededor.
 * Al abrirla se encoge un instante, la tapa salta por los aires dando vueltas, de dentro sale luz y
 * una lluvia de estrellitas sube en espiral hacia el cielo (la cámara la sigue con la mirada).
 * Va en las coordenadas del valle (dentro de su grupo).
 */

/** Caja sin la cara de arriba (BoxGeometry con su grupo +y quitado): se ve por dentro al abrirla. */
const cajaAbierta = (lado: number, alto: number): THREE.BufferGeometry => {
  const caja = new THREE.BoxGeometry(lado, alto, lado)
  const indice = caja.getIndex()
  if (!indice) return caja
  const grupoArriba = caja.groups[2]
  const restantes: number[] = []
  for (let i = 0; i < indice.count; i += 1) {
    if (i >= grupoArriba.start && i < grupoArriba.start + grupoArriba.count) continue
    restantes.push(indice.getX(i))
  }
  caja.setIndex(restantes)
  caja.clearGroups()
  return caja
}

const material = (tipo: number, tinta: boolean, grosor = 0): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    vertexShader: CAJITA_VERT,
    fragmentShader: CAJITA_FRAG,
    uniforms: { uTipo: { value: tipo }, uTinta: { value: tinta ? 1 : 0 }, uGrosor: { value: grosor }, uLuzDentro: { value: 0 } },
    side: tinta ? THREE.BackSide : tipo === 0 ? THREE.DoubleSide : THREE.FrontSide,
  })

/** Un trozo de la cajita con su contorno de tinta (la misma forma, algo mayor, por detrás). */
interface Pieza {
  geometria: THREE.BufferGeometry
  tipo: number
  /** Grosor del contorno, en fracción del tamaño de la pieza. */
  contorno: number
  posicion: readonly [number, number, number]
  rotacion?: readonly [number, number, number]
}

const ESPESOR_CINTA = 0.036

export function Cajita({ uniformes }: { uniformes: UniformesValle }) {
  const grupoCaja = useRef<THREE.Group>(null)
  const grupoTapa = useRef<THREE.Group>(null)
  const { lado, alto, tapa, tocon } = CAJITA

  const piezas = useMemo(() => {
    const cuerpo: Pieza[] = [
      { geometria: cajaAbierta(lado, alto), tipo: 0, contorno: 0.06, posicion: [0, alto / 2, 0] },
      { geometria: new THREE.BoxGeometry(lado + 0.006, alto + 0.002, ESPESOR_CINTA), tipo: 1, contorno: 0.04, posicion: [0, alto / 2, 0] },
      { geometria: new THREE.BoxGeometry(ESPESOR_CINTA, alto + 0.002, lado + 0.006), tipo: 1, contorno: 0.04, posicion: [0, alto / 2, 0] },
    ]
    const ladoTapa = lado + 0.02
    const tapaPiezas: Pieza[] = [
      { geometria: new THREE.BoxGeometry(ladoTapa, tapa, ladoTapa), tipo: 0, contorno: 0.06, posicion: [0, tapa / 2, 0] },
      { geometria: new THREE.BoxGeometry(ladoTapa + 0.006, tapa + 0.004, ESPESOR_CINTA), tipo: 1, contorno: 0.05, posicion: [0, tapa / 2, 0] },
      { geometria: new THREE.BoxGeometry(ESPESOR_CINTA, tapa + 0.004, ladoTapa + 0.006), tipo: 1, contorno: 0.05, posicion: [0, tapa / 2, 0] },
      // El lazo: dos lazadas y el nudo.
      { geometria: new THREE.TorusGeometry(0.036, 0.012, 10, 20), tipo: 1, contorno: 0.12, posicion: [-0.032, tapa + 0.03, 0], rotacion: [0, 0, 0.7] },
      { geometria: new THREE.TorusGeometry(0.036, 0.012, 10, 20), tipo: 1, contorno: 0.12, posicion: [0.032, tapa + 0.03, 0], rotacion: [0, 0, -0.7] },
      { geometria: new THREE.SphereGeometry(0.018, 14, 10), tipo: 1, contorno: 0.18, posicion: [0, tapa + 0.012, 0] },
    ]
    const toconPieza: Pieza = { geometria: new THREE.CylinderGeometry(0.15, 0.18, tocon, 20), tipo: 2, contorno: 0.05, posicion: [0, tocon / 2, 0] }
    return { cuerpo, tapa: tapaPiezas, tocon: toconPieza }
  }, [lado, alto, tapa, tocon])

  const materiales = useMemo(() => {
    const cache = new Map<string, THREE.ShaderMaterial>()
    const obtener = (tipo: number, tinta: boolean, grosor: number): THREE.ShaderMaterial => {
      const clave = `${tipo}-${tinta}-${grosor}`
      let m = cache.get(clave)
      if (!m) {
        m = material(tipo, tinta, grosor)
        cache.set(clave, m)
      }
      return m
    }
    return { obtener, todos: cache }
  }, [])

  // La lluvia de estrellitas (y las que titilan alrededor estando cerrada).
  const destellos = useMemo(() => {
    const cuantos = 90
    const azar = new Float32Array(cuantos * 4)
    let semilla = 20261001
    const aleatorio = (): number => {
      semilla = (semilla * 1664525 + 1013904223) >>> 0
      return semilla / 4294967296
    }
    for (let i = 0; i < cuantos; i += 1) {
      // z < 0.06: de las que titilan alrededor (las 5 primeras); el resto, de la lluvia.
      const deAlrededor = i < 5
      azar.set([aleatorio(), aleatorio(), deAlrededor ? (i + 0.5) * 0.012 : 0.07 + 0.93 * aleatorio(), aleatorio()], i * 4)
    }
    const geometria = crearQuadInstanciado({ aAzar: [azar, 4] }, cuantos)
    const mat = new THREE.ShaderMaterial({
      vertexShader: DESTELLO_CAJITA_VERT,
      fragmentShader: DESTELLO_CAJITA_FRAG,
      uniforms: {
        uCentro: { value: new THREE.Vector3(CENTRO_CAJITA[0], CAJITA.tocon + CAJITA.alto, CENTRO_CAJITA[2]) },
        uTiempo: { value: 0 },
        uLluvia: { value: -1 },
        uAbierta: { value: 0 },
        uRumbo: { value: new THREE.Vector2(VISTA_CIELO.rumbo[0], VISTA_CIELO.rumbo[1]) },
        uCamara: uniformes.uCamara,
        uPixelesPorRadian: uniformes.uPixelesPorRadian,
      },
      side: THREE.DoubleSide,
      // Sin profundidad, como las mariposas: el pase no las toma por siluetas.
      depthWrite: false,
    })
    return { geometria, material: mat }
  }, [uniformes])

  useEffect(
    () => () => {
      for (const grupo of [piezas.cuerpo, piezas.tapa, [piezas.tocon]]) for (const p of grupo) p.geometria.dispose()
      for (const m of materiales.todos.values()) m.dispose()
      destellos.geometria.dispose()
      destellos.material.dispose()
    },
    [piezas, materiales, destellos],
  )

  // De frente a donde se posa la cámara, algo girada (se ven dos caras, como en un dibujo).
  const giro = useMemo(() => {
    const final = CAMARA_VALLE[CAMARA_VALLE.length - 1].posicion
    return Math.atan2(final[0] - CAJITA.x, final[2] - CAJITA.z) + 0.42
  }, [])

  useFrame(({ clock }) => {
    const caja = grupoCaja.current
    const tapaGrupo = grupoTapa.current
    if (!caja || !tapaGrupo) return
    const t = clock.getElapsedTime()
    const s = desdeLlegada()
    const abierta = CARTA.fase !== 'cerrada' && s >= COREOGRAFIA.tapa
    // Cerrada: un meneo de vez en cuando; al abrirla, un temblor y se encoge antes de saltar la tapa.
    let meneo = 0
    let aplastar = 0
    if (CARTA.fase === 'cerrada' || s < 0) {
      const k = (t % 4.8) / 0.75
      if (k < 1) meneo = 0.09 * Math.sin(k * Math.PI * 4) * Math.sin(k * Math.PI)
    } else if (s < COREOGRAFIA.tapa) {
      const k = s / COREOGRAFIA.tapa
      meneo = 0.05 * Math.sin(s * 42) * k
      aplastar = 0.1 * Math.sin(k * Math.PI * 0.5)
    } else {
      // Al saltar la tapa, la caja se estira un instante y vuelve.
      const k = s - COREOGRAFIA.tapa
      aplastar = -0.12 * Math.exp(-k * 7) * Math.cos(k * 18)
    }
    caja.rotation.z = meneo
    caja.scale.set(1 + aplastar * 0.5, 1 - aplastar, 1 + aplastar * 0.5)

    // La tapa: sobre la caja o por los aires (sube, da vueltas, cae a un lado y desaparece).
    if (!abierta) {
      tapaGrupo.visible = true
      tapaGrupo.position.set(0, alto * (1 - aplastar), 0)
      tapaGrupo.rotation.set(0, 0, 0)
    } else {
      const k = s - COREOGRAFIA.tapa
      tapaGrupo.visible = k < 1.5
      tapaGrupo.position.set(0.55 * k, alto + 1.7 * k - 2.6 * k * k, 0.15 * k)
      tapaGrupo.rotation.set(1.3 * k, 0.6 * k, -4.2 * k)
    }

    const luzDentro = abierta ? Math.min(1, (s - COREOGRAFIA.tapa) / 0.25) : 0
    for (const m of materiales.todos.values()) if (m.uniforms.uTipo.value === 0) m.uniforms.uLuzDentro.value = luzDentro
    const u = destellos.material.uniforms
    u.uTiempo.value = t
    u.uAbierta.value = abierta ? 1 : 0
    u.uLluvia.value = abierta ? s - COREOGRAFIA.tapa : -1
  })

  const dibujar = (pieza: Pieza, clave: string) => (
    <group key={clave} position={pieza.posicion as [number, number, number]} rotation={(pieza.rotacion ?? [0, 0, 0]) as [number, number, number]}>
      <mesh geometry={pieza.geometria} material={materiales.obtener(pieza.tipo, false, 0)} />
      <mesh geometry={pieza.geometria} material={materiales.obtener(pieza.tipo, true, pieza.contorno)} />
    </group>
  )

  return (
    <>
      <group position={[CAJITA.x, 0, CAJITA.z]} rotation={[0, giro, 0]}>
        {dibujar(piezas.tocon, 'tocon')}
        <group ref={grupoCaja} position={[0, tocon, 0]}>
          {piezas.cuerpo.map((p, i) => dibujar(p, `cuerpo-${i}`))}
          <group ref={grupoTapa}>{piezas.tapa.map((p, i) => dibujar(p, `tapa-${i}`))}</group>
        </group>
      </group>
      <mesh geometry={destellos.geometria} material={destellos.material} frustumCulled={false} renderOrder={2} />
    </>
  )
}
