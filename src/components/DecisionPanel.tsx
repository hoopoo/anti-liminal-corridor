import { motion, AnimatePresence } from 'framer-motion'
import { useExperienceStore } from '../store/experienceStore'

export function DecisionPanel() {
  const mode = useExperienceStore((s) => s.mode)
  const choose = useExperienceStore((s) => s.choose)
  const setHoverPreview = useExperienceStore((s) => s.setHoverPreview)

  return (
    <AnimatePresence>
      {mode === 'deciding' && (
        <motion.div
          className="decision-panel"
          role="dialog"
          aria-label="Presence"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="decision-prompt">trace detected.</p>
          <div className="decision-actions">
            <button
              type="button"
              className="decision-option"
              onClick={() => choose('approach')}
              onPointerEnter={() => setHoverPreview('approach')}
              onPointerLeave={() => setHoverPreview(null)}
              onPointerCancel={() => setHoverPreview(null)}
            >
              approach
            </button>
            <span className="decision-sep" aria-hidden>
              ·
            </span>
            <button
              type="button"
              className="decision-option"
              onClick={() => choose('ignore')}
              onPointerEnter={() => setHoverPreview('ignore')}
              onPointerLeave={() => setHoverPreview(null)}
              onPointerCancel={() => setHoverPreview(null)}
            >
              ignore
            </button>
            <span className="decision-sep" aria-hidden>
              ·
            </span>
            <button
              type="button"
              className="decision-option"
              onClick={() => choose('leave')}
              onPointerEnter={() => setHoverPreview('leave')}
              onPointerLeave={() => setHoverPreview(null)}
              onPointerCancel={() => setHoverPreview(null)}
            >
              leave
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
