import { IsNumber, Max, Min } from 'class-validator'

export class UpdateLocationDto {
  // Faixas válidas de latitude/longitude — antes qualquer número era aceito, então
  // um cliente bugado podia gravar coords absurdas (ex.: 9999) e furar o matching
  // por raio (o entregador "sumia" do cálculo de distância).
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number
}
