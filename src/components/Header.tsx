import { useEffect, useRef, useState } from 'react'
import { FilePdf, List, X } from '@phosphor-icons/react'
import { MotionToggle, ThemeToggle } from './PreferenceControls'

const navigation = [
  { label: 'Work', href: '#work' },
  { label: 'Experience', href: '#experience' },
  { label: 'Stack', href: '#stack' },
  { label: 'Contact', href: '#contact' },
]

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const menu = menuRef.current
    const trigger = menuButtonRef.current
    const focusable = Array.from(menu?.querySelectorAll<HTMLElement>('a[href]') ?? [])
    const desktopQuery = window.matchMedia('(min-width: 900px)')

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        return
      }
      if (event.key !== 'Tab' || focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (document.activeElement === trigger) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        trigger?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        trigger?.focus()
      }
    }

    document.addEventListener('keydown', handleKeydown)
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false)
    }
    desktopQuery.addEventListener('change', closeOnDesktop)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeydown)
      desktopQuery.removeEventListener('change', closeOnDesktop)
      document.body.style.overflow = ''
      trigger?.focus()
    }
  }, [menuOpen])

  return (
    <>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Ruphak Varmaa, home">
          <img src="/ruphak-mark.png" alt="" width="32" height="32" />
          <span>RV</span>
        </a>

        <nav className="desktop-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <MotionToggle />
          <ThemeToggle />
          <a
            className="resume-control"
            href="/Ruphak-Varmaa-Resume.pdf"
            download="Ruphak-Varmaa-Resume.pdf"
          >
            <FilePdf aria-hidden="true" />
            <span>Resume</span>
          </a>
          <button
            ref={menuButtonRef}
            className="menu-control"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((current) => !current)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <List aria-hidden="true" />}
          </button>
        </div>
      </header>

      <div
        ref={menuRef}
        className="mobile-menu"
        id="mobile-menu"
        data-open={menuOpen}
        aria-hidden={!menuOpen}
      >
        <nav aria-label="Mobile navigation">
          {navigation.map((item) => (
            <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)} tabIndex={menuOpen ? 0 : -1}>
              {item.label}
            </a>
          ))}
        </nav>
        <a
          className="mobile-resume"
          href="/Ruphak-Varmaa-Resume.pdf"
          download="Ruphak-Varmaa-Resume.pdf"
          tabIndex={menuOpen ? 0 : -1}
        >
          Download resume
        </a>
      </div>
    </>
  )
}
