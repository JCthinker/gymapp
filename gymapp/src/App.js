import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import './App.css'

const CLAUDE_API = 'https://api.anthropic.com/v1/messages'

const MUSCLE_ORDER = ['Espalda', 'Pecho', 'Pierna', 'Brazos', 'Hombros']

const SYSTEM_PROMPT = `Eres el entrenador personal de JC. Su objetivo es definición y tonificación SIN ganar volumen. Entrena 1h30min por sesión.

PRINCIPIOS:
- Reps: 12-20 para tonificación
- Descanso: 60-90 seg entre series
- Progresión: subir 2.5kg cuando domina el rango superior
- Orden ejercicios: barra/mancuernas primero, cables después, máquinas al final
- Lumbar sensible: evitar cargar peso en hombros doblado hacia adelante, remos inclinados con barra
- Siempre 8 ejercicios por sesión
- Nunca repetir los mismos ejercicios que la sesión anterior del mismo grupo muscular

CICLO SEMANAL: Espalda → Pecho → Pierna → Brazos → Hombros → Cardio finde

Cuando generes una sesión, responde SOLO con JSON válido con este formato exacto:
{
  "muscle_group": "Pecho",
  "exercises": [
    { "name": "Press de Banca (Barra)", "sets": 4, "reps": "12", "weight": 52.5, "notes": "Sube desde 50kg" },
    ...
  ],
  "summary": "Breve resumen de cambios respecto a la sesión anterior"
}`

export default function App() {
  const [screen, setScreen] = useState('dashboard')
  const [workouts, setWorkouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [aiSession, setAiSession] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [logWorkout, setLogWorkout] = useState(null)
  const [historyGroup, setHistoryGroup] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchWorkouts = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('workouts')
      .select('*, workout_sets(*)')
      .order('date', { ascending: false })
      .limit(50)
    if (!error) setWorkouts(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchWorkouts() }, [fetchWorkouts])

  const getTodayMuscle = () => {
    if (workouts.length === 0) return MUSCLE_ORDER[0]
    const lastMuscle = workouts[0]?.muscle_group
    const idx = MUSCLE_ORDER.indexOf(lastMuscle)
    return MUSCLE_ORDER[(idx + 1) % MUSCLE_ORDER.length]
  }

  const getLastWorkoutForGroup = (group) =>
    workouts.find(w => w.muscle_group === group)

  const generateSession = async () => {
    setAiLoading(true)
    setAiSession(null)
    const todayMuscle = getTodayMuscle()
    const lastSession = getLastWorkoutForGroup(todayMuscle)

    let historyText = `Grupo muscular de hoy: ${todayMuscle}\n`
    if (lastSession) {
      historyText += `\nÚltima sesión de ${todayMuscle} (${lastSession.date}):\n`
      lastSession.workout_sets?.forEach(s => {
        historyText += `- ${s.exercise_name}: ${s.set_number} series x ${s.reps} reps @ ${s.weight_kg}kg\n`
      })
    } else {
      historyText += `No hay historial previo para ${todayMuscle}.\n`
    }

    const allRecent = workouts.slice(0, 20)
    historyText += `\nEjercicios usados recientemente (evitar repetir):\n`
    const used = new Set()
    allRecent.forEach(w => w.workout_sets?.forEach(s => used.add(s.exercise_name)))
    historyText += [...used].join(', ')

    try {
      const res = await fetch(CLAUDE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: historyText }]
        })
      })
      const data = await res.json()
      const text = data.content?.map(b => b.text || '').join('')
      const clean = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      setAiSession(parsed)
    } catch (e) {
      showToast('Error generando sesión. Inténtalo de nuevo.', 'error')
    }
    setAiLoading(false)
  }

  const saveWorkout = async (muscleGroup, exercises) => {
    const date = new Date().toISOString().split('T')[0]
    const { data: workout, error } = await supabase
      .from('workouts')
      .insert({ muscle_group: muscleGroup, date, notes: '' })
      .select()
      .single()

    if (error) { showToast('Error guardando entreno', 'error'); return }

    const sets = []
    exercises.forEach(ex => {
      for (let i = 1; i <= ex.sets; i++) {
        sets.push({
          workout_id: workout.id,
          exercise_name: ex.name,
          set_number: i,
          weight_kg: parseFloat(ex.weight) || 0,
          reps: parseInt(ex.reps) || 0
        })
      }
    })

    await supabase.from('workout_sets').insert(sets)
    showToast('Entreno guardado!')
    fetchWorkouts()
    setScreen('dashboard')
    setLogWorkout(null)
    setAiSession(null)
  }

  return (
    <div className="app">
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      {screen === 'dashboard' && (
        <Dashboard
          workouts={workouts}
          loading={loading}
          todayMuscle={getTodayMuscle()}
          onGenerate={() => { generateSession(); setScreen('session') }}
          onLog={() => { setLogWorkout({ muscle_group: getTodayMuscle(), exercises: [] }); setScreen('log') }}
          onHistory={() => setScreen('history')}
          onPlan={() => setScreen('plan')}
        />
      )}

      {screen === 'session' && (
        <SessionScreen
          session={aiSession}
          loading={aiLoading}
          onBack={() => setScreen('dashboard')}
          onStartLog={(session) => {
            setLogWorkout({
              muscle_group: session.muscle_group,
              exercises: session.exercises.map(e => ({ ...e, sets: e.sets || 3 }))
            })
            setScreen('log')
          }}
        />
      )}

      {screen === 'log' && (
        <LogScreen
          initial={logWorkout}
          onBack={() => setScreen('dashboard')}
          onSave={saveWorkout}
        />
      )}

      {screen === 'history' && (
        <HistoryScreen
          workouts={workouts}
          muscleGroups={MUSCLE_ORDER}
          selected={historyGroup}
          onSelect={setHistoryGroup}
          onBack={() => setScreen('dashboard')}
        />
      )}

      {screen === 'plan' && (
        <PlanScreen
          workouts={workouts}
          muscleOrder={MUSCLE_ORDER}
          todayMuscle={getTodayMuscle()}
          onBack={() => setScreen('dashboard')}
        />
      )}

      <NavBar screen={screen} setScreen={setScreen} />
    </div>
  )
}

function Dashboard({ workouts, loading, todayMuscle, onGenerate, onLog, onHistory, onPlan }) {
  const recent = workouts.slice(0, 5)
  return (
    <div className="screen">
      <div className="dashboard-header">
        <div className="greeting">Buenos días</div>
        <div className="user-tag">JC</div>
      </div>

      <div className="today-card">
        <div className="today-label">Toca hoy</div>
        <div className="today-muscle">{todayMuscle}</div>
        <div className="today-actions">
          <button className="btn-primary" onClick={onGenerate}>Generar sesión con IA</button>
          <button className="btn-secondary" onClick={onLog}>Registrar manualmente</button>
        </div>
      </div>

      <div className="section-title">Últimos entrenamientos</div>
      {loading ? <div className="loading-text">Cargando...</div> : (
        <div className="recent-list">
          {recent.length === 0 && <div className="empty-text">No hay entrenamientos aún</div>}
          {recent.map(w => (
            <div key={w.id} className="recent-item">
              <div className="recent-muscle">{w.muscle_group}</div>
              <div className="recent-date">{w.date}</div>
              <div className="recent-sets">{w.workout_sets?.length || 0} series</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SessionScreen({ session, loading, onBack, onStartLog }) {
  return (
    <div className="screen">
      <div className="screen-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <div className="screen-title">Sesión de hoy</div>
      </div>

      {loading && (
        <div className="ai-loading">
          <div className="ai-spinner"></div>
          <div className="ai-loading-text">Generando sesión personalizada...</div>
        </div>
      )}

      {!loading && !session && (
        <div className="empty-text">Pulsa "Generar sesión con IA" desde el inicio</div>
      )}

      {session && (
        <div className="session-content">
          <div className="session-muscle">{session.muscle_group}</div>
          {session.summary && <div className="session-summary">{session.summary}</div>}

          <div className="exercise-list">
            {session.exercises?.map((ex, i) => (
              <div key={i} className="exercise-card">
                <div className="ex-num">{i + 1}</div>
                <div className="ex-info">
                  <div className="ex-name">{ex.name}</div>
                  <div className="ex-detail">{ex.sets} × {ex.reps} reps{ex.weight ? ` · ${ex.weight}kg` : ''}</div>
                  {ex.notes && <div className="ex-notes">{ex.notes}</div>}
                </div>
              </div>
            ))}
          </div>

          <button className="btn-primary full" onClick={() => onStartLog(session)}>
            Empezar y registrar
          </button>
        </div>
      )}
    </div>
  )
}

function LogScreen({ initial, onBack, onSave }) {
  const [muscleGroup, setMuscleGroup] = useState(initial?.muscle_group || 'Espalda')
  const [exercises, setExercises] = useState(
    initial?.exercises?.length > 0
      ? initial.exercises
      : [{ name: '', sets: 3, reps: '12', weight: '' }]
  )

  const addExercise = () =>
    setExercises([...exercises, { name: '', sets: 3, reps: '12', weight: '' }])

  const removeExercise = (i) =>
    setExercises(exercises.filter((_, idx) => idx !== i))

  const updateEx = (i, field, val) => {
    const updated = [...exercises]
    updated[i] = { ...updated[i], [field]: val }
    setExercises(updated)
  }

  const handleSave = () => {
    const valid = exercises.filter(e => e.name.trim())
    if (valid.length === 0) return
    onSave(muscleGroup, valid)
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <div className="screen-title">Registrar entreno</div>
      </div>

      <div className="form-group">
        <label className="form-label">Grupo muscular</label>
        <select className="form-select" value={muscleGroup} onChange={e => setMuscleGroup(e.target.value)}>
          {MUSCLE_ORDER.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>

      <div className="log-exercises">
        {exercises.map((ex, i) => (
          <div key={i} className="log-ex-card">
            <div className="log-ex-header">
              <span className="log-ex-num">{i + 1}</span>
              <button className="remove-btn" onClick={() => removeExercise(i)}>×</button>
            </div>
            <input
              className="form-input"
              placeholder="Nombre del ejercicio"
              value={ex.name}
              onChange={e => updateEx(i, 'name', e.target.value)}
            />
            <div className="log-ex-row">
              <div className="form-group small">
                <label className="form-label">Series</label>
                <input className="form-input" type="number" value={ex.sets} onChange={e => updateEx(i, 'sets', e.target.value)} />
              </div>
              <div className="form-group small">
                <label className="form-label">Reps</label>
                <input className="form-input" value={ex.reps} onChange={e => updateEx(i, 'reps', e.target.value)} />
              </div>
              <div className="form-group small">
                <label className="form-label">Peso (kg)</label>
                <input className="form-input" type="number" value={ex.weight} onChange={e => updateEx(i, 'weight', e.target.value)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="btn-secondary full" onClick={addExercise}>+ Añadir ejercicio</button>
      <button className="btn-primary full mt" onClick={handleSave}>Guardar entreno</button>
    </div>
  )
}

function HistoryScreen({ workouts, muscleGroups, selected, onSelect, onBack }) {
  const filtered = selected ? workouts.filter(w => w.muscle_group === selected) : workouts

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <div className="screen-title">Historial</div>
      </div>

      <div className="filter-tabs">
        <button className={`filter-tab ${!selected ? 'active' : ''}`} onClick={() => onSelect(null)}>Todo</button>
        {muscleGroups.map(m => (
          <button key={m} className={`filter-tab ${selected === m ? 'active' : ''}`} onClick={() => onSelect(m)}>{m}</button>
        ))}
      </div>

      <div className="history-list">
        {filtered.length === 0 && <div className="empty-text">No hay entrenamientos</div>}
        {filtered.map(w => (
          <div key={w.id} className="history-card">
            <div className="history-header">
              <div className="history-muscle">{w.muscle_group}</div>
              <div className="history-date">{w.date}</div>
            </div>
            <div className="history-exercises">
              {Object.entries(
                (w.workout_sets || []).reduce((acc, s) => {
                  if (!acc[s.exercise_name]) acc[s.exercise_name] = s
                  return acc
                }, {})
              ).map(([name, s]) => (
                <div key={name} className="history-ex">
                  <span className="history-ex-name">{name}</span>
                  <span className="history-ex-detail">{s.weight_kg}kg × {s.reps}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlanScreen({ workouts, muscleOrder, todayMuscle, onBack }) {
  const todayIdx = muscleOrder.indexOf(todayMuscle)

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <div className="screen-title">Plan semanal</div>
      </div>

      <div className="plan-grid">
        {muscleOrder.map((m, i) => {
          const last = workouts.find(w => w.muscle_group === m)
          const isToday = m === todayMuscle
          const isDone = i < todayIdx
          return (
            <div key={m} className={`plan-card ${isToday ? 'today' : ''} ${isDone ? 'done' : ''}`}>
              <div className="plan-day">Día {i + 1}</div>
              <div className="plan-muscle">{m}</div>
              {last && <div className="plan-last">Último: {last.date}</div>}
              {isToday && <div className="plan-badge">Hoy</div>}
            </div>
          )
        })}
        <div className="plan-card cardio">
          <div className="plan-day">Finde</div>
          <div className="plan-muscle">Cardio</div>
        </div>
      </div>
    </div>
  )
}

function NavBar({ screen, setScreen }) {
  const tabs = [
    { id: 'dashboard', label: 'Inicio', icon: '⌂' },
    { id: 'plan', label: 'Plan', icon: '◫' },
    { id: 'history', label: 'Historial', icon: '◷' },
  ]
  return (
    <nav className="navbar">
      {tabs.map(t => (
        <button key={t.id} className={`nav-btn ${screen === t.id ? 'active' : ''}`} onClick={() => setScreen(t.id)}>
          <span className="nav-icon">{t.icon}</span>
          <span className="nav-label">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
