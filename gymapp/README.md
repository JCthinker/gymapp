# GymCoach

Tu entrenador personal con IA. PWA instalable en móvil y PC.

## Setup

### 1. Supabase — ya configurado con tus credenciales

Las tablas necesarias están en el SQL del chat.

### 2. Subir a Vercel

```bash
npm install -g vercel
cd gymapp
vercel
```

Sigue los pasos, acepta los defaults. En 2 minutos tienes la URL.

### 3. Instalar como PWA en móvil

- iOS: Safari → Compartir → Añadir a pantalla de inicio
- Android: Chrome → Menú → Instalar app

## Funcionalidades

- **Dashboard** — qué toca hoy según tu ciclo
- **Generar sesión con IA** — Claude lee tu historial y propone 8 ejercicios con pesos
- **Registrar entreno** — añade ejercicios, series, pesos
- **Historial** — todos tus entrenamientos por grupo muscular
- **Plan semanal** — vista de tu ciclo completo
