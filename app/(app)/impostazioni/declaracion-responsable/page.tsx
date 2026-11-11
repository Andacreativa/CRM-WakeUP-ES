"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import type { ImpostazioniFatture } from "@/lib/impostazioni";

// Dichiarazione responsabile del sistema informatico di fatturazione (art. 15
// Orden HAC/1177/2024): l'AEAT la vuole «accesible dentro del propio SIF»,
// scritta dal produttore del programma, che qui è l'azienda stessa. Segue
// l'esempio pubblicato dall'AEAT (EjemplosDeclaracionResponsable V0.5.1).
// Vale per la versione indicata qui sotto: a ogni versione nuova si aggiorna
// data e versione e si conserva la precedente (storia del repository).
const DICHIARAZIONE = {
  version: "1.0",
  fecha: "11 de noviembre de 2026",
  lugar: "Puerto de Santiago, Santiago del Teide (Santa Cruz de Tenerife) – España",
};

export default function DeclaracionResponsablePage() {
  const [cfg, setCfg] = useState<ImpostazioniFatture | null>(null);
  useEffect(() => {
    fetch("/api/impostazioni/fatture")
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => {});
  }, []);
  if (!cfg) return <div className="p-6 text-sm text-gray-500">Caricamento…</div>;

  const direccion = [
    cfg.indirizzo,
    [cfg.cap, cfg.citta].filter(Boolean).join(" "),
    cfg.provincia ? `(${cfg.provincia})` : "",
    "España",
  ]
    .filter(Boolean)
    .join(", ");
  const versioneDiversa = cfg.vfVersion.trim() !== DICHIARAZIONE.version;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <style>{`@media print { .no-print, nav, aside, header { display: none !important; } .declaracion { box-shadow: none !important; border: 0 !important; } }`}</style>
      <div className="flex items-center justify-between gap-3 no-print">
        <Link href="/impostazioni" className="btn btn-secondary">
          <ArrowLeft /> Impostazioni
        </Link>
        <button type="button" onClick={() => window.print()} className="btn btn-primary">
          <Printer /> Stampa / PDF
        </button>
      </div>
      {versioneDiversa && (
        <p className="no-print rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          Le Impostazioni indicano la versione {cfg.vfVersion || "—"} ma questa dichiarazione vale per la{" "}
          {DICHIARAZIONE.version}: va aggiornata (data, versione e novità) prima di emettere.
        </p>
      )}

      <article className="declaracion glass-card rounded-2xl p-8 space-y-5 text-[14px] leading-relaxed text-gray-900">
        <header className="text-center space-y-1">
          <h1 className="text-lg font-bold uppercase tracking-wide">Declaración responsable</h1>
          <p className="text-base font-semibold uppercase">del sistema informático de facturación</p>
        </header>

        <Punto n="1.a" t="Nombre del sistema informático a que se refiere esta declaración responsable:">
          {cfg.vfNombreSistema}
        </Punto>
        <Punto n="1.b" t="Código identificador del sistema informático a que se refiere el apartado a) de esta declaración responsable:">
          {cfg.vfIdSistema}
        </Punto>
        <Punto n="1.c" t="Identificador completo de la versión concreta del sistema informático a que se refiere esta declaración responsable:">
          {DICHIARAZIONE.version}
        </Punto>
        <Punto n="1.d" t="Componentes, hardware y software, de que consta el sistema informático a que se refiere esta declaración responsable, junto con una breve descripción de lo que hace dicho sistema informático y de sus principales funcionalidades:">
          <p>
            Se trata de un software de facturación desarrollado por {cfg.ragioneSociale} para su propio uso
            exclusivo (desarrollo propio, no comercializado ni cedido a terceros), al que se accede desde
            un navegador web con usuario y contraseña. Consta de:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Aplicación web (Next.js / React, TypeScript) ejecutada en la plataforma en la nube Vercel,
              que no requiere instalación en los equipos del usuario.
            </li>
            <li>
              Base de datos PostgreSQL (servicio Neon) en la que se conservan las facturas, los registros
              de facturación y la configuración, con copias de seguridad periódicas.
            </li>
            <li>
              Módulo de generación del registro de facturación: huella (hash SHA-256) encadenada con el
              registro anterior, XML conforme a los esquemas publicados por la AEAT y envío al servicio
              web VERI*FACTU de la Agencia Tributaria mediante certificado electrónico cualificado del
              obligado tributario, con control del tiempo de espera indicado por la AEAT y reintento de
              los envíos no confirmados.
            </li>
            <li>
              Generación del documento PDF de la factura con el código QR tributario y la leyenda
              «VERI*FACTU».
            </li>
          </ul>
          <p>
            Principales funcionalidades: gestión de clientes, expedición de facturas y de facturas
            rectificativas (por sustitución y por diferencias), anulación de facturas, consulta y envío
            por correo electrónico, cobros y vencimientos, exportación de datos de facturación. El número
            de factura y el registro de facturación se generan en una misma unidad transaccional de la
            base de datos, de modo que no existe factura expedida sin su registro ni registro sin
            factura.
          </p>
        </Punto>
        <Punto n="1.e" t="Indicación de si el sistema informático a que se refiere esta declaración responsable se ha producido de tal manera que, a los efectos de cumplir con el Reglamento, solo pueda funcionar exclusivamente como «VERI*FACTU»:">
          S - Sí
        </Punto>
        <Punto n="1.f" t="Indicación de si el sistema informático a que se refiere la declaración responsable permite ser usado por varios obligados tributarios o por un mismo usuario para dar soporte a la facturación de varios obligados tributarios:">
          N - No. Da soporte únicamente a la facturación de {cfg.ragioneSociale} (NIF {cfg.nif}).
        </Punto>
        <Punto n="1.g" t="Tipos de firma utilizados para firmar los registros de facturación y de evento en el caso de que el sistema informático a que se refiere esta declaración responsable no sea utilizado como «VERI*FACTU»:">
          Dado que se trata de un sistema de facturación que solo puede ser utilizado exclusivamente en la
          modalidad de «VERI*FACTU», no se realiza una firma electrónica expresa de los registros de
          facturación generados, ya que la normativa considera que quedan firmados al ser remitidos
          correctamente a los servicios electrónicos de la Agencia Tributaria con la debida autenticación
          mediante el adecuado certificado electrónico cualificado.
        </Punto>
        <Punto n="1.h" t="Razón social de la entidad productora del sistema informático a que se refiere esta declaración responsable:">
          {cfg.ragioneSociale}
        </Punto>
        <Punto n="1.i" t="Número de identificación fiscal (NIF) español de la entidad productora del sistema informático a que se refiere esta declaración responsable:">
          {cfg.nif}
        </Punto>
        <Punto n="1.j" t="Dirección postal completa de contacto de la entidad productora del sistema informático a que se refiere esta declaración responsable:">
          {direccion}
        </Punto>
        <Punto n="1.k" t="">
          <p className="font-semibold">
            La entidad productora del sistema informático a que se refiere esta declaración responsable hace
            constar que dicho sistema informático, en la versión indicada en ella, cumple con lo dispuesto
            en el artículo 29.2.j) de la Ley 58/2003, de 17 de diciembre, General Tributaria, en el
            Reglamento que establece los requisitos que deben adoptar los sistemas y programas informáticos
            o electrónicos que soporten los procesos de facturación de empresarios y profesionales, y la
            estandarización de formatos de los registros de facturación, aprobado por el Real Decreto
            1007/2023, de 5 de diciembre, en la Orden HAC/1177/2024, de 17 de octubre, y en la sede
            electrónica de la Agencia Estatal de Administración Tributaria para todo aquello que complete
            las especificaciones de dicha orden.
          </p>
        </Punto>
        <Punto n="1.l" t="Fecha y lugar en que la entidad productora de este sistema informático suscribe esta declaración responsable del mismo:">
          {DICHIARAZIONE.fecha}
          <br />
          {DICHIARAZIONE.lugar}
        </Punto>

        <h2 className="text-center font-bold uppercase pt-2">Anexo</h2>
        <Punto n="2.a" t="Otras formas de contacto con la entidad productora del sistema informático a que se refiere esta declaración responsable:">
          {[cfg.email && `Correo electrónico: ${cfg.email}`, cfg.telefono && `Teléfono: ${cfg.telefono}`]
            .filter(Boolean)
            .join(" · ") || "—"}
        </Punto>
        <Punto n="2.b" t="Acceso a esta declaración responsable y a las de versiones anteriores:">
          Esta declaración está disponible dentro del propio sistema informático (Impostazioni › VeriFactu ›
          Dichiarazione responsabile) en cada una de sus versiones. Las declaraciones de las versiones
          sustituidas se conservan en el histórico del código fuente del sistema y a disposición de la
          Administración tributaria.
        </Punto>
        <Punto n="2.c" t="El sistema informático a que se refiere esta declaración responsable cumple las diferentes especificaciones técnicas y funcionales contenidas en la Orden HAC/1177/2024, de 17 de octubre, y en la sede electrónica de la Agencia Estatal de Administración Tributaria para todo aquello que complete las especificaciones de dicha orden, de la siguiente manera:">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Empleo de la tecnología transaccional del sistema gestor de base de datos para lograr la
              consolidación, en una sola unidad transaccional, de la expedición de la factura y la
              generación del registro de facturación correspondiente a la factura.
            </li>
            <li>
              Cálculo de la huella de cada registro de facturación (SHA-256) sobre los campos y en el orden
              establecidos por la AEAT, encadenada con la huella del registro inmediatamente anterior; los
              registros de alta y de anulación se conservan íntegros e inalterados en la base de datos.
            </li>
            <li>
              Remisión inmediata de los registros de facturación al servicio web de la AEAT en el momento
              de la expedición, con respeto del tiempo de espera entre envíos indicado por la Agencia
              Tributaria y reenvío, marcado como incidencia, de los registros que no hayan podido
              remitirse; la remisión se autentica con el certificado electrónico cualificado del obligado
              tributario.
            </li>
            <li>
              Las facturas rectificativas se emiten en una serie propia e identifican la factura
              rectificada; las facturas expedidas no pueden modificarse ni eliminarse, solo rectificarse o
              anularse mediante el correspondiente registro.
            </li>
            <li>
              Inclusión en la factura del código QR tributario (30 × 30 mm, al principio del documento) y de
              la leyenda «VERI*FACTU».
            </li>
          </ul>
        </Punto>
      </article>
    </div>
  );
}

function Punto({ n, t, children }: { n: string; t: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      {t ? (
        <p className="text-gray-600">
          <span className="font-semibold text-gray-900">{n})</span> {t}
        </p>
      ) : (
        <p className="font-semibold text-gray-900">{n})</p>
      )}
      <div className="pl-4 font-semibold space-y-2">{children}</div>
    </section>
  );
}
