using UnityEngine;

public class CameraShake : MonoBehaviour
{
    public static CameraShake Instance { get; private set; }
    
    [SerializeField] private float shakeMagnitude = 0.2f;
    
    private Vector3 originalPosition;
    private float currentShakeDuration;
    
    private void Awake()
    {
        // Singleton pattern
        if (Instance == null)
        {
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }
        else
        {
            Destroy(gameObject);
        }
    }
    
    private void Start()
    {
        originalPosition = transform.position;
    }
    
    private void Update()
    {
        if (currentShakeDuration > 0)
        {
            // Rastgele offset ile sarsıntı
            Vector3 shakeOffset = Random.insideUnitSphere * shakeMagnitude;
            shakeOffset.z = originalPosition.z; // Z pozisyonunu koru
            
            transform.position = originalPosition + shakeOffset;
            
            currentShakeDuration -= Time.deltaTime;
        }
        else
        {
            // Orijinal pozisyona geri dön
            transform.position = originalPosition;
        }
    }
    
    // YENİ: Meşhur vuruş hissi - Shake fonksiyonu
    public void Shake(float duration, float magnitude)
    {
        currentShakeDuration = duration;
        shakeMagnitude = magnitude;
    }
}
