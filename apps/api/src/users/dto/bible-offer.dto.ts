import { IsBoolean } from 'class-validator'

export class BibleOfferDto {
  /** true = quer receber o exemplar; false = dispensou a cortesia. */
  @IsBoolean()
  accepted: boolean
}
