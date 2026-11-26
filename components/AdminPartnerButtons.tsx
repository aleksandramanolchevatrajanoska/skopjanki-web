"use client";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/** Save button that saves only its own partner and says when it is done, without reloading the page. */
export function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  const was = useRef(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (was.current && !pending) {
      setDone(true);
      const t = setTimeout(() => setDone(false), 2500);
      return () => clearTimeout(t);
    }
    was.current = pending;
  }, [pending]);
  return (
    <button className="btn sm" type="submit" disabled={pending}>
      {pending ? "Saving…" : done ? "Saved ✓" : label}
    </button>
  );
}

/** Delete asks once in the page itself before anything is removed. */
export function DeleteButton({ name }: { name: string }) {
  const [sure, setSure] = useState(false);
  const { pending } = useFormStatus();
  if (!sure) return <button className="btn sm ghost" type="button" onClick={() => setSure(true)}>Delete</button>;
  return (
    <span className="row" style={{ gap: 8 }}>
      <span className="meta">Delete {name} for good?</span>
      <button className="btn sm pink" type="submit" disabled={pending}>{pending ? "Deleting…" : "Yes, delete"}</button>
      <button className="btn sm ghost" type="button" onClick={() => setSure(false)}>Keep</button>
    </span>
  );
}
