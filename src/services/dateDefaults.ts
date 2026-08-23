const pad = (value: number) => String(value).padStart(2, '0')

export const getPreviousLocalDate = () => {
  const date = new Date()
  date.setDate(date.getDate() - 1)

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const getPreviousLocalDateTime = (time: string) => `${getPreviousLocalDate()}T${time}`
