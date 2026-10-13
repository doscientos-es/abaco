import {
  Bank,
  Buildings,
  CalendarBlank,
  CurrencyEur,
  FileText,
  Globe,
  Hash,
  IdentificationCard,
  MagnifyingGlass,
  MapPin,
  Percent,
  Phone,
  Ruler,
  Tag,
  User,
  EnvelopeSimple,
} from '@phosphor-icons/react'

const cls = 'size-4 shrink-0'

/** Small leading icons for text inputs and cards (Phosphor). Weight comes from the surrounding IconContext. */
export const fieldIcons = {
  user: <User aria-hidden="true" className={cls} />,
  building: <Buildings aria-hidden="true" className={cls} />,
  id: <IdentificationCard aria-hidden="true" className={cls} />,
  phone: <Phone aria-hidden="true" className={cls} />,
  mail: <EnvelopeSimple aria-hidden="true" className={cls} />,
  pin: <MapPin aria-hidden="true" className={cls} />,
  globe: <Globe aria-hidden="true" className={cls} />,
  euro: <CurrencyEur aria-hidden="true" className={cls} />,
  percent: <Percent aria-hidden="true" className={cls} />,
  hash: <Hash aria-hidden="true" className={cls} />,
  tag: <Tag aria-hidden="true" className={cls} />,
  ruler: <Ruler aria-hidden="true" className={cls} />,
  calendar: <CalendarBlank aria-hidden="true" className={cls} />,
  bank: <Bank aria-hidden="true" className={cls} />,
  file: <FileText aria-hidden="true" className={cls} />,
  search: <MagnifyingGlass aria-hidden="true" className={cls} />,
}
