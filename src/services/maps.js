let loadPromise = null

export function loadGoogleMaps() {
  if (loadPromise) return loadPromise
  if (window.google?.maps?.places) return Promise.resolve(window.google)

  loadPromise = new Promise((resolve, reject) => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    if (!key) {
      reject(new Error('NO_KEY'))
      loadPromise = null
      return
    }

    const callbackName = '__gmaps_cb__'
    window[callbackName] = () => {
      resolve(window.google)
      delete window[callbackName]
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=${callbackName}&language=zh-TW&region=TW`
    script.async = true
    script.defer = true
    script.onerror = () => {
      reject(new Error('LOAD_FAIL'))
      loadPromise = null
    }
    document.head.appendChild(script)
  })

  return loadPromise
}

// 搜尋附近地點（radius 單位：公尺）
export function nearbySearch(lat, lng, type, radius = 500) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('div')
    const service = new window.google.maps.places.PlacesService(el)
    service.nearbySearch(
      {
        location: new window.google.maps.LatLng(lat, lng),
        radius,
        type,
      },
      (results, status) => {
        const S = window.google.maps.places.PlacesServiceStatus
        if (status === S.OK && results) {
          resolve(results.slice(0, 6).map(p => ({
            name: p.name,
            placeId: p.place_id,
            address: p.vicinity ?? '',
            lat: p.geometry.location.lat(),
            lng: p.geometry.location.lng(),
            rating: p.rating ?? null,
            photo: p.photos?.[0]?.getUrl({ maxWidth: 300 }) ?? null,
          })))
        } else if (status === S.ZERO_RESULTS) {
          resolve([])
        } else {
          reject(new Error(status))
        }
      }
    )
  })
}

// 取得地點詳細資料（含照片、評分、營業時間）
export function getPlaceDetails(placeId) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('div')
    const service = new window.google.maps.places.PlacesService(el)
    service.getDetails(
      {
        placeId,
        fields: [
          'name', 'formatted_address', 'geometry', 'place_id',
          'photos', 'rating', 'user_ratings_total',
          'opening_hours', 'business_status',
          'formatted_phone_number', 'website',
          'editorial_summary',
        ],
      },
      (place, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
          const photo = place.photos?.[0]?.getUrl({ maxWidth: 600, maxHeight: 300 }) ?? null
          const weekdayText = place.opening_hours?.weekday_text ?? null
          // Google weekday_text: index 0=Monday ... 6=Sunday
          // JS getDay(): 0=Sunday, 1=Monday ... 6=Saturday
          const todayIdx = (new Date().getDay() + 6) % 7
          const todayHours = weekdayText?.[todayIdx] ?? null
          const isOpen = place.opening_hours?.isOpen?.() ?? null

          resolve({
            name: place.name,
            address: place.formatted_address,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            placeId: place.place_id,
            photo,
            rating: place.rating ?? null,
            ratingsTotal: place.user_ratings_total ?? null,
            weekdayText,
            todayHours,
            isOpen,
            phone: place.formatted_phone_number ?? null,
            website: place.website ?? null,
            summary: place.editorial_summary?.overview ?? null,
            businessStatus: place.business_status ?? null,
          })
        } else {
          reject(new Error(status))
        }
      }
    )
  })
}
