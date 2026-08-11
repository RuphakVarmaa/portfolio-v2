import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Check,
  Copy,
  FilePdf,
  GithubLogo,
  LinkedinLogo,
} from '@phosphor-icons/react'
import { profile } from '../data/portfolio'

export function Footer() {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(profile.email)
      setCopied(true)
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.location.href = `mailto:${profile.email}`
    }
  }

  return (
    <footer className="site-footer" id="contact">
      <div className="footer-main">
        <p className="footer-eyebrow">START A CONVERSATION</p>
        <h2>Build something that has to hold.</h2>
        <a className="footer-email" href={`mailto:${profile.email}`}>
          {profile.email}
          <ArrowUpRight aria-hidden="true" />
        </a>
        <button className="copy-email" type="button" onClick={copyEmail} aria-live="polite">
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? 'Email copied' : 'Copy email'}
        </button>
      </div>

      <div className="footer-links">
        <a href={profile.linkedin} target="_blank" rel="noreferrer">
          <LinkedinLogo aria-hidden="true" />
          LinkedIn
        </a>
        <a href={profile.github} target="_blank" rel="noreferrer">
          <GithubLogo aria-hidden="true" />
          GitHub
        </a>
        <a href="/Ruphak-Varmaa-Resume.pdf" download="Ruphak-Varmaa-Resume.pdf">
          <FilePdf aria-hidden="true" />
          Resume
        </a>
        <a href={`tel:${profile.phone.replaceAll(' ', '')}`}>{profile.phone}</a>
      </div>

      <div className="footer-bottom">
        <span>{profile.name}</span>
        <span>Backend / Distributed Systems / Cloud / AI</span>
        <span>{new Date().getFullYear()}</span>
      </div>
    </footer>
  )
}
