import ReactMarkdown from 'react-markdown'

import type { ContractDocumentSection } from '../domain/contract-document-template'

/** Saved copies without a format marker remain plain text, as in existing contracts. */
export function ContractTemplateContent({ section }: { section: ContractDocumentSection }) {
  return (
    <section
      className="contract-template-section"
      data-page-break={section.pageBreakBefore || undefined}
    >
      {section.title ? <h2 className="mb-2 font-semibold">{section.title}</h2> : null}
      {section.format === 'markdown' ? (
        <div className="[&_a]:text-primary space-y-3 break-words [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-auto [&_ul]:list-disc [&_ul]:pl-5">
          <ReactMarkdown disallowedElements={['img']}>{section.content}</ReactMarkdown>
        </div>
      ) : (
        <p className="whitespace-pre-wrap">{section.content}</p>
      )}
    </section>
  )
}
