using UnityEngine;
using UnityEditor;

public class CleanHierarchy : MonoBehaviour
{
    [MenuItem("Tools/Clean Hierarchy")]
    public static void CleanAllEffects()
    {
        // Hierarchy'deki tüm efekt objelerini temizle
        GameObject[] allObjects = GameObject.FindObjectsOfType<GameObject>();
        
        foreach (GameObject obj in allObjects)
        {
            if (obj.name.Contains("SmokeEffect") || 
                obj.name.Contains("Particle_") || 
                obj.name.Contains("GhostEffect") ||
                obj.name.Contains("RowLineEffect") ||
                obj.name.Contains("ColumnLineEffect") ||
                obj.name.Contains("ShockWave"))
            {
                DestroyImmediate(obj);
                Debug.Log($"Destroyed: {obj.name}");
            }
        }
        
        Debug.Log("Hierarchy cleaned from all effect objects!");
    }
}
