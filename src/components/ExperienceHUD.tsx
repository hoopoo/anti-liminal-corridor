import { motion, AnimatePresence } from 'framer-motion'
import { useExperienceStore } from '../store/experienceStore'

export function ExperienceHUD() {
  const phase = useExperienceStore((s) => s.phase)
  const mode = useExperienceStore((s) => s.mode)
  const uncertainty = useExperienceStore((s) => s.uncertainty)

  const visible = phase >= 2

  let traceDisplay = '—'
  if (mode === 'resolving') {
    traceDisplay = '…'
  } else if (mode === 'resolved') {
    traceDisplay = 'logged'
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="hud"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        >
          <div className="hud-row">
            <span className="hud-label">trace</span>
            <span className="hud-value">{traceDisplay}</span>
          </div>
          <div className="hud-row">
            <span className="hud-label">uncertainty</span>
            <span className="hud-value">{uncertainty}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
