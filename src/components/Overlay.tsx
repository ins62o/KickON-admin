import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, ChevronDown, Copy } from "lucide-react";
import { services } from "../content";
import { Wordmark } from "./Wordmark";

export type View = "menu" | "projects" | "plans" | "team" | "faqs" | "contact" | "booking";
const menu = [["projects", "Projects"], ["plans", "Plans"], ["team", "Team"], ["faqs", "FAQs"], ["contact", "Get in Touch"]] as const;

function InquiryForm({ booking, service }: { booking: boolean; service?: string }) {
  const [copied, setCopied] = useState(false);
  const [inquiry, setInquiry] = useState("");
  const [copyFailed, setCopyFailed] = useState(false);
  const output = useRef<HTMLTextAreaElement>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const text = [booking ? "Alwayzz: 15-minute chat request" : "Alwayzz: project inquiry", `Name: ${fields.get("name")}`, `Email: ${fields.get("email")}`, booking ? `Preferred time: ${fields.get("day")} at ${fields.get("time")} (${timeZone})` : `Service: ${fields.get("service")}`, `Project: ${fields.get("message") || "Let's discuss it on the call."}`].join("\n");
    setInquiry(text);
    try { await navigator.clipboard.writeText(text); setCopied(true); setCopyFailed(false); }
    catch { setCopyFailed(true); setCopied(false); }
  };
  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return <form className="inquiry-form" onSubmit={submit} onChange={() => { setCopied(false); setInquiry(""); setCopyFailed(false); }}>
    <div className="form-row"><label>Your name<input name="name" autoComplete="name" required maxLength={100} placeholder="Alex Morgan" /></label><label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="alex@company.com" /></label></div>
    {booking ? <><div className="form-row"><label>Preferred day<input name="day" type="date" min={minDate} required /></label><label>Preferred time<input name="time" type="time" required /></label></div><p className="form-note">Your time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. This is a meeting request, not a confirmed reservation.</p></> : <label>What can we help with?<select name="service" defaultValue={service}>{services.map(service => <option key={service}>{service}</option>)}<option>Let’s figure it out together</option></select></label>}
    <label>A little about your project<textarea name="message" rows={3} required={!booking} maxLength={2000} placeholder="What are you making?" /></label>
    <p className="form-note">Copy your request to share with the team. Nothing is sent automatically.</p>
    <button type="submit" className="primary-button form-submit">{copied ? <><Check size={16} aria-hidden="true" />Request copied</> : <><Copy size={16} aria-hidden="true" />{booking ? "Copy meeting request" : "Copy inquiry"}</>}</button>
    <p className="copy-status" role="status">{copied ? "Your request is ready to paste into a message." : copyFailed ? "Select and copy your request below." : ""}</p>
    {inquiry && copyFailed ? <textarea ref={output} className="copy-output" aria-label="Your request to copy" readOnly value={inquiry} rows={6} onFocus={() => output.current?.select()} /> : null}
  </form>;
}

function Panel({ view, open, selectedService }: { view: Exclude<View, "menu">; open: (view: View, service?: string) => void; selectedService: string }) {
  if (view === "booking") return <><p className="panel-kicker">A quick introduction</p><h2 id="overlay-title" tabIndex={-1}>Let’s talk for <em>15 minutes.</em></h2><p className="panel-description">Choose a time that works for you and prepare a request for the team.</p><InquiryForm key="booking" booking /></>;
  if (view === "contact") return <><p className="panel-kicker">Get in touch</p><h2 id="overlay-title" tabIndex={-1}>What are you <em>making?</em></h2><p className="panel-description">Tell us a little about your next idea.</p><InquiryForm key="project" booking={false} service={selectedService} /></>;
  if (view === "faqs") return <><h2 id="overlay-title" tabIndex={-1}>A few <em>answers.</em></h2><div className="faq-list">{[["What can we work on together?", "Brand identity, app development, visual design, creative video, and iconography."], ["Who is Alwayzz for?", "Founders, brands, and agencies looking for a flexible creative partnership."], ["How do we get started?", "Share what you’re making, or prepare a request for a 15-minute introductory chat."]].map(([q, a]) => <details key={q}><summary>{q}<ChevronDown size={18} aria-hidden="true" /></summary><p>{a}</p></details>)}</div><button className="text-button" onClick={() => open("contact")}>Still have a question?<ArrowUpRight size={17} aria-hidden="true" /></button></>;
  if (view === "team") return <><h2 id="overlay-title" tabIndex={-1}>Your next creative <em>partner.</em></h2><div className="team-intro"><img src="./media/avatar.png" width="120" height="120" alt="A smiling creative partner" /><p>A flexible design partnership for founders, brands, and agencies who want top craft delivered on their timeline.</p></div><button className="primary-button" onClick={() => open("booking")}>Chat for 15 minutes<ArrowUpRight size={17} aria-hidden="true" /></button></>;
  return <><p className="panel-kicker">{view === "plans" ? "Creative support, on demand" : "Bring your next idea to life"}</p><h2 id="overlay-title" tabIndex={-1}>{view === "plans" ? <>A partnership that <em>fits.</em></> : <>What shall we <em>make?</em></>}</h2><p className="panel-description">{view === "plans" ? "Start with what you need. Let’s find the right creative partnership for your project and timeline." : "Explore the kind of work we can take on together."}</p><div className="service-options">{services.map((service, i) => <button key={service} onClick={() => open("contact", service)}><span className="service-number" aria-hidden="true">0{i + 1}</span>{service}<ArrowUpRight size={17} aria-hidden="true" /></button>)}</div><button className="primary-button" onClick={() => open("booking")}>Let’s talk about your project<ArrowUpRight size={17} aria-hidden="true" /></button></>;
}

export function Overlay({ view, isOpen, open, close, selectedService }: { view: View; isOpen: boolean; open: (view: View, service?: string) => void; close: () => void; selectedService: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const requestClose = () => dialog.current?.close();
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (isOpen && !node.open) node.showModal();
    if (!isOpen && node.open) node.close();
    if (isOpen) node.querySelector<HTMLElement>(view === "menu" ? ".menu-links a" : "#overlay-title")?.focus();
  }, [isOpen, view]);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [isOpen]);
  return <dialog id="site-overlay" ref={dialog} className={`site-overlay ${view === "menu" ? "menu-overlay" : "content-overlay"}`} aria-labelledby={view === "menu" ? "menu-title" : "overlay-title"} onClose={close} onClick={event => { if (view !== "menu" && event.target === event.currentTarget) requestClose(); }}>
    {view === "menu" ? <div className="menu-surface"><div className="overlay-header"><Wordmark onClick={requestClose} /><button className="menu-button" aria-label="Close menu" onClick={requestClose}>Close<ChevronDown size={16} aria-hidden="true" /></button></div><h2 id="menu-title" className="visually-hidden">Explore Alwayzz</h2><nav className="menu-links" aria-label="Main navigation">{menu.map(([key, label]) => <a href={`#${key}`} key={key} onClick={event => { event.preventDefault(); open(key); }}>{label}<ArrowUpRight size={36} aria-hidden="true" /></a>)}</nav><div className="menu-footer"><span>Creative partnership. On your terms.</span><span>© {new Date().getFullYear()} Alwayzz</span></div></div> : <section className="panel"><button className="panel-close" onClick={requestClose} aria-label="Close dialog">Close<span aria-hidden="true">×</span></button><Panel view={view} open={open} selectedService={selectedService} /></section>}
  </dialog>;
}
